import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import {
  createBillingFingerprint,
  normalizeTaxId,
  readBillingFingerprint,
} from "@/lib/billing-fingerprint";
import { envFlag, getSiteUrl, requireEnv } from "@/lib/env";
import { requireUser } from "@/lib/server/auth";
import { requireStripeProduct } from "@/lib/server/catalog";
import {
  checkoutSessionDisposition,
  supersededCheckoutSessionCanRelease,
} from "@/lib/server/checkout-session-state";
import { getCheckoutTotals } from "@/lib/server/checkout-totals";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getStripe } from "@/lib/server/stripe";
import { reconcileCustomerTaxIds } from "@/lib/server/stripe-tax-ids";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkoutSchema } from "@/lib/validation/checkout";

const euCountries = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit({
      bucket: "checkout-session-totals",
      subject: user.id,
      maximum: 60,
      windowSeconds: 600,
    });
    const sessionId = new URL(request.url).searchParams
      .get("session_id")
      ?.trim();
    if (!sessionId || !/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
      throw new HttpError(
        400,
        "Die Zahlungssitzung ist nicht gültig.",
        "invalid_checkout_session",
      );
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,stripe_price_id,billing_snapshot")
      .eq("user_id", user.id)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (orderError) {
      throw new HttpError(
        503,
        "Die Zahlungssitzung kann gerade nicht sicher geprüft werden.",
      );
    }
    if (!order) {
      throw new HttpError(
        404,
        "Die Zahlungssitzung wurde nicht gefunden.",
        "checkout_session_not_found",
      );
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await getStripe().checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price"],
      });
    } catch {
      throw new HttpError(
        502,
        "Die aktuellen Zahlungsbeträge konnten nicht von Stripe geladen werden.",
        "stripe_session_unavailable",
      );
    }
    const billingFingerprint = readBillingFingerprint(order.billing_snapshot);
    if (
      !billingFingerprint ||
      session.client_reference_id !== user.id ||
      session.metadata?.user_id !== user.id ||
      session.metadata?.order_id !== order.id ||
      session.metadata?.billing_fingerprint !== billingFingerprint
    ) {
      throw new HttpError(
        403,
        "Die Zahlungssitzung gehört nicht zu diesem Konto.",
        "checkout_session_forbidden",
      );
    }
    const sessionPrice = session.line_items?.data[0]?.price;
    if (!sessionPrice || sessionPrice.id !== order.stripe_price_id) {
      throw new HttpError(
        409,
        "Die Preisangaben der Zahlungssitzung konnten nicht bestätigt werden.",
        "checkout_price_mismatch",
      );
    }

    return Response.json(
      {
        sessionId: session.id,
        sessionStatus: session.status,
        paymentStatus: session.payment_status,
        totals: getCheckoutTotals(session, sessionPrice.tax_behavior),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  // New sessions must use the payment-first intent route. Keeping GET and the
  // legacy fulfillment code allows already-open sessions from the previous
  // deployment to drain, while this runtime guard prevents any new unpaid
  // Order/Enrollment pair from being created through the historical endpoint.
  if (request.method === "POST") {
    return Response.json(
      {
        ok: false,
        error: "legacy_checkout_disabled",
        message:
          "Bitte starte den sicheren Checkout neu. Konto und Bestellung entstehen erst nach bestätigter Zahlung.",
      },
      { status: 410, headers: noStoreHeaders() },
    );
  }
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!user.email || !user.email_confirmed_at) {
      throw new HttpError(
        403,
        "Bitte bestätige zuerst deine E-Mail-Adresse.",
        "email_verification_required",
      );
    }
    await enforceRateLimit({
      bucket: "checkout-session",
      subject: user.id,
      maximum: 6,
      windowSeconds: 1800,
    });
    const input = checkoutSchema.parse(await readJson(request));
    const [product, courseResult] = await Promise.all([
      requireStripeProduct(),
      getSupabaseAdmin()
        .from("courses")
        .select("id,title,version")
        .eq("slug", "online-schulung-wimpernverlaengerung")
        .eq("status", "published")
        .single(),
    ]);
    if (courseResult.error || !courseResult.data) {
      throw new HttpError(
        503,
        "Der Kurs ist derzeit nicht für den Verkauf konfiguriert.",
        "course_unavailable",
      );
    }

    const admin = getSupabaseAdmin();
    const { data: existingAccess, error: existingAccessError } = await admin
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", courseResult.data.id)
      .in("status", ["active", "completed"])
      .maybeSingle();
    if (existingAccessError) {
      throw new HttpError(
        503,
        "Der bestehende Kurszugang kann gerade nicht sicher geprüft werden.",
      );
    }
    if (existingAccess) {
      throw new HttpError(
        409,
        "Du besitzt bereits einen aktiven Zugang zu dieser Schulung.",
        "already_enrolled",
      );
    }
    const expectedConsentVersion = requireEnv("CHECKOUT_CONSENT_VERSION");
    const legalTextHash = requireEnv("CHECKOUT_LEGAL_TEXT_HASH");
    if (input.consentVersion !== expectedConsentVersion) {
      throw new HttpError(
        409,
        "Die Rechtstexte wurden aktualisiert. Bitte lade den Checkout neu.",
        "consent_version_changed",
      );
    }
    const stripe = getStripe();
    const isBusiness = input.billingType === "business";
    const companyName = isBusiness ? (input.companyName?.trim() ?? null) : null;
    const contactPerson = isBusiness
      ? (input.contactPerson?.trim() ?? null)
      : null;
    const legalForm = isBusiness ? (input.legalForm?.trim() ?? null) : null;
    const taxId = isBusiness ? (input.taxId?.trim() ?? null) : null;
    const name = isBusiness
      ? `${companyName}${legalForm ? ` ${legalForm}` : ""}`
      : `${input.firstName} ${input.lastName}`;
    const usesDifferentBillingAddress =
      isBusiness && input.differentBillingAddress;
    const companyCountry = isBusiness ? input.companyCountry! : input.country;
    const address: Stripe.AddressParam = {
      line1: usesDifferentBillingAddress ? input.billingStreet! : input.street,
      postal_code: usesDifferentBillingAddress
        ? input.billingPostalCode!
        : input.postalCode,
      city: usesDifferentBillingAddress ? input.billingCity! : input.city,
      country: usesDifferentBillingAddress
        ? input.billingCountry!
        : companyCountry,
    };

    let desiredTaxId: Stripe.CustomerCreateParams.TaxIdDatum | null = null;
    if (taxId) {
      const taxType: Stripe.CustomerCreateParams.TaxIdDatum.Type | undefined =
        euCountries.has(companyCountry)
          ? "eu_vat"
          : companyCountry === "CH"
            ? "ch_vat"
            : undefined;
      if (!taxType) {
        throw new HttpError(
          400,
          "Für dieses Land kann die Steuer-ID derzeit nicht sicher verarbeitet werden.",
          "unsupported_tax_id_country",
        );
      }
      desiredTaxId = { type: taxType, value: taxId };
    }

    const billingSnapshotBase = {
      billingType: input.billingType,
      firstName: input.firstName,
      lastName: input.lastName,
      companyName,
      contactPerson,
      legalForm,
      invoiceName: name,
      companyCountry: isBusiness ? companyCountry : null,
      companyAddress: isBusiness
        ? {
            street: input.street,
            postalCode: input.postalCode,
            city: input.city,
            country: companyCountry,
          }
        : null,
      differentBillingAddress: usesDifferentBillingAddress,
      billingAddress: {
        street: address.line1,
        postalCode: address.postal_code,
        city: address.city,
        country: address.country,
      },
      street: address.line1,
      postalCode: address.postal_code,
      city: address.city,
      country: address.country,
      taxId,
      consentVersion: expectedConsentVersion,
      productName: product.name,
      unitAmount: product.unitAmount,
      currency: product.currency,
      taxBehavior: product.taxBehavior,
    };
    const billingFingerprint = createBillingFingerprint({
      schemaVersion: 1,
      userId: user.id,
      billingEmail: user.email.trim().toLowerCase(),
      courseId: courseResult.data.id,
      courseVersion: courseResult.data.version,
      stripePriceId: product.priceId,
      billing: {
        ...billingSnapshotBase,
        taxId: taxId ? normalizeTaxId(taxId) : null,
      },
    });
    const billingSnapshot = {
      ...billingSnapshotBase,
      billingFingerprint,
    };
    const customerMetadata = {
      user_id: user.id,
      billing_type: input.billingType,
      billing_fingerprint: billingFingerprint,
      course_id: courseResult.data.id,
      course_version: courseResult.data.version,
      price_id: product.priceId,
      ...(legalForm ? { legal_form: legalForm } : {}),
      ...(contactPerson ? { contact_person: contactPerson } : {}),
    };
    const leaseToken = randomUUID();
    const renewCheckoutLease = async () => {
      const { data, error } = await admin.rpc(
        "acquire_checkout_customer_lease",
        {
          lease_user_id: user.id,
          requested_lease_token: leaseToken,
          lease_ttl_seconds: 300,
        },
      );
      if (error) {
        throw new HttpError(
          503,
          "Der Checkout kann gerade nicht sicher serialisiert werden.",
        );
      }
      if (data !== true) {
        throw new HttpError(
          409,
          "Ein weiterer Checkout für dieses Konto wird gerade vorbereitet. Bitte versuche es gleich erneut.",
          "checkout_in_progress",
        );
      }
    };
    await renewCheckoutLease();

    try {
      const { data: customerMapping, error: customerMappingError } = await admin
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (customerMappingError) {
        throw new HttpError(
          503,
          "Das Zahlungskonto kann gerade nicht sicher geprüft werden.",
        );
      }
      let resolvedCustomerId = customerMapping?.stripe_customer_id as
        string | undefined;
      if (!resolvedCustomerId) {
        let customer: Stripe.Customer;
        await renewCheckoutLease();
        try {
          const discovered: Stripe.Customer[] = [];
          let startingAfter: string | undefined;
          do {
            await renewCheckoutLease();
            const page = await stripe.customers.list({
              limit: 100,
              ...(startingAfter ? { starting_after: startingAfter } : {}),
            });
            discovered.push(
              ...page.data.filter(
                (candidate) => candidate.metadata?.user_id === user.id,
              ),
            );
            if (discovered.length > 1) break;
            if (!page.has_more) break;
            startingAfter = page.data.at(-1)?.id;
            if (!startingAfter) {
              throw new Error("Stripe customer pagination is incomplete.");
            }
          } while (startingAfter);
          if (discovered.length > 1) {
            throw new HttpError(
              409,
              "Für dieses Konto wurden mehrere Stripe-Kundenzuordnungen gefunden. Bitte kontaktiere den Support.",
              "duplicate_stripe_customers",
            );
          }
          if (discovered[0]) {
            customer = discovered[0];
          } else {
            await renewCheckoutLease();
            customer = await stripe.customers.create(
              {
                email: user.email,
                metadata: { user_id: user.id },
              },
              { idempotencyKey: `customer-${user.id}` },
            );
          }
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            502,
            "Das Zahlungskonto konnte nicht sicher gesucht oder vorbereitet werden.",
            "stripe_customer_unavailable",
          );
        }
        if (customer.metadata?.user_id !== user.id) {
          throw new HttpError(
            502,
            "Das Zahlungskonto konnte nicht sicher zugeordnet werden.",
            "stripe_customer_mismatch",
          );
        }
        resolvedCustomerId = customer.id;
        const { error: mappingError } = await admin
          .from("stripe_customers")
          .insert({
            user_id: user.id,
            stripe_customer_id: resolvedCustomerId,
          });
        if (mappingError) {
          const { data: existing, error: fallbackError } = await admin
            .from("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user.id)
            .single();
          if (fallbackError || !existing) {
            // The insert may have committed even if its response or the
            // fallback read failed. Never delete this stable-idempotency
            // Customer: a retry must be able to map the same live object.
            throw new HttpError(
              503,
              "Das Zahlungskonto konnte nicht gespeichert werden.",
            );
          }
          if (existing.stripe_customer_id !== customer.id) {
            throw new HttpError(
              409,
              "Die Stripe-Kundenzuordnung ist widersprüchlich. Bitte kontaktiere den Support.",
              "duplicate_stripe_customers",
            );
          }
          resolvedCustomerId = existing.stripe_customer_id;
        }
      }
      if (!resolvedCustomerId) {
        throw new HttpError(
          503,
          "Das Zahlungskonto konnte nicht vorbereitet werden.",
        );
      }

      const claimOrder = async () => {
        const { data, error } = await admin.rpc("claim_checkout_order", {
          checkout_user_id: user.id,
          checkout_course_id: courseResult.data.id,
          checkout_customer_id: resolvedCustomerId,
          checkout_price_id: product.priceId,
          checkout_business_purchase: input.billingType === "business",
          checkout_billing_snapshot: billingSnapshot,
        });
        const claim = Array.isArray(data) ? data[0] : data;
        if (error || !claim?.order_id) {
          throw new HttpError(
            503,
            "Die Bestellung konnte nicht vorbereitet werden.",
          );
        }
        return {
          id: claim.order_id as string,
          sessionId: claim.checkout_session_id as string | null,
          rotatedSessionId: claim.rotated_checkout_session_id as string | null,
        };
      };

      const synchronizeCustomerAndProfile = async (orderId: string) => {
        await renewCheckoutLease();
        const customerUpdate: Stripe.CustomerUpdateParams = {
          email: user.email,
          name,
          address,
          preferred_locales: ["de"],
          metadata: {
            ...customerMetadata,
            legal_form: legalForm ?? "",
            contact_person: contactPerson ?? "",
          },
        };
        const customerMatchesCheckout = (
          candidate: Stripe.Customer | Stripe.DeletedCustomer,
        ): candidate is Stripe.Customer =>
          !("deleted" in candidate && candidate.deleted) &&
          candidate.id === resolvedCustomerId &&
          candidate.email?.trim().toLowerCase() ===
            user.email?.trim().toLowerCase() &&
          candidate.name === name &&
          candidate.address?.line1 === address.line1 &&
          candidate.address?.postal_code === address.postal_code &&
          candidate.address?.city === address.city &&
          candidate.address?.country === address.country &&
          candidate.preferred_locales?.includes("de") === true &&
          candidate.metadata.user_id === user.id &&
          candidate.metadata.billing_type === input.billingType &&
          candidate.metadata.billing_fingerprint === billingFingerprint &&
          candidate.metadata.course_id === courseResult.data.id &&
          candidate.metadata.course_version === courseResult.data.version &&
          candidate.metadata.price_id === product.priceId;
        const updateAndVerifyCustomer = async (
          idempotencyKey: string,
        ): Promise<boolean> => {
          await renewCheckoutLease();
          try {
            await stripe.customers.update(resolvedCustomerId, customerUpdate, {
              idempotencyKey,
            });
          } catch {
            // The request may have reached Stripe despite a cached 5xx or a
            // lost response. A live retrieve below is authoritative.
          }
          await renewCheckoutLease();
          try {
            return customerMatchesCheckout(
              await stripe.customers.retrieve(resolvedCustomerId),
            );
          } catch {
            return false;
          }
        };
        try {
          const primaryUpdateMatches = await updateAndVerifyCustomer(
            `checkout-customer-update-${orderId}-${billingFingerprint}`,
          );
          if (
            !primaryUpdateMatches &&
            !(await updateAndVerifyCustomer(
              `checkout-customer-recovery-${orderId}-${leaseToken}`,
            ))
          ) {
            throw new Error("Stripe customer update could not be verified.");
          }
          await reconcileCustomerTaxIds(
            stripe,
            resolvedCustomerId,
            desiredTaxId,
            `${orderId}-${leaseToken}`,
            renewCheckoutLease,
          );
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            desiredTaxId ? 400 : 502,
            desiredTaxId
              ? "Die Umsatzsteuer-ID konnte nicht bestätigt werden."
              : "Das Zahlungskonto konnte nicht aktualisiert werden.",
            desiredTaxId ? "invalid_tax_id" : "stripe_customer_unavailable",
          );
        }

        await renewCheckoutLease();
        const { data: profileUpdated, error: profileError } = await admin.rpc(
          "update_checkout_profile_under_lease",
          {
            checkout_profile_user_id: user.id,
            checkout_lease_token: leaseToken,
            checkout_first_name: input.firstName,
            checkout_last_name: input.lastName,
            checkout_billing_type: input.billingType,
            checkout_company_name: companyName,
            checkout_contact_person: contactPerson,
            checkout_billing_address: {
              street: address.line1,
              postalCode: address.postal_code,
              city: address.city,
              country: address.country,
            },
            checkout_tax_id: taxId,
          },
        );
        if (profileError || profileUpdated !== true) {
          throw new HttpError(
            503,
            "Die Rechnungsdaten konnten nicht gespeichert werden.",
          );
        }
      };

      const linkCheckoutSession = async (
        orderId: string,
        sessionId: string,
      ): Promise<boolean> => {
        const { data: updatedOrder, error: sessionUpdateError } = await admin
          .from("orders")
          .update({ stripe_checkout_session_id: sessionId })
          .eq("id", orderId)
          .eq("user_id", user.id)
          .in("payment_status", ["pending", "processing"])
          .is("stripe_checkout_session_id", null)
          .select("id")
          .maybeSingle();
        if (updatedOrder && !sessionUpdateError) return true;

        const { data: currentOrder, error: currentOrderError } = await admin
          .from("orders")
          .select("stripe_checkout_session_id,payment_status")
          .eq("id", orderId)
          .eq("user_id", user.id)
          .maybeSingle();
        return (
          !currentOrderError &&
          currentOrder?.stripe_checkout_session_id === sessionId &&
          ["pending", "processing"].includes(currentOrder.payment_status)
        );
      };

      const recoverUnlinkedCheckoutSession = async (
        orderId: string,
      ): Promise<Stripe.Checkout.Session | null> => {
        await renewCheckoutLease();
        const listed = await stripe.checkout.sessions.list({
          customer: resolvedCustomerId,
          limit: 100,
        });
        if (listed.has_more) {
          throw new HttpError(
            409,
            "Vorhandene Zahlungssitzungen müssen zuerst sicher geprüft werden.",
            "checkout_session_inventory_required",
          );
        }
        const matching = listed.data.filter(
          (candidate) =>
            candidate.metadata?.order_id === orderId &&
            candidate.metadata?.user_id === user.id,
        );
        if (matching.length > 1) {
          throw new HttpError(
            409,
            "Für diese Bestellung wurden mehrere Zahlungssitzungen gefunden. Bitte kontaktiere den Support und starte keine weitere Zahlung.",
            "duplicate_checkout_sessions",
          );
        }
        if (!matching[0]) return null;
        await renewCheckoutLease();
        return stripe.checkout.sessions.retrieve(matching[0].id);
      };

      const expireOrder = async (orderId: string) => {
        const { data: expiredOrder, error: expiredOrderError } = await admin
          .from("orders")
          .update({ payment_status: "expired" })
          .eq("id", orderId)
          .eq("user_id", user.id)
          .in("payment_status", ["pending", "processing"])
          .select("id")
          .maybeSingle();
        if (expiredOrderError) {
          throw new HttpError(
            503,
            "Die abgelaufene Bestellung konnte nicht sicher abgeschlossen werden.",
          );
        }
        if (expiredOrder) return;

        const { data: currentOrder, error: currentOrderError } = await admin
          .from("orders")
          .select("payment_status")
          .eq("id", orderId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!currentOrderError && currentOrder?.payment_status === "expired")
          return;
        if (
          !currentOrderError &&
          currentOrder &&
          ["paid", "refunded", "disputed"].includes(currentOrder.payment_status)
        ) {
          throw new HttpError(
            409,
            "Deine Zahlung wird bereits bestätigt.",
            "payment_processing",
          );
        }
        throw new HttpError(
          503,
          "Die abgelaufene Bestellung konnte nicht sicher abgeschlossen werden.",
        );
      };

      const expireStripeSession = async (
        candidate: Stripe.Checkout.Session,
      ) => {
        if (candidate.status === "expired" || candidate.status === "complete")
          return;
        try {
          await stripe.checkout.sessions.expire(candidate.id);
        } catch {
          // A subsequent claimed order retains this session as a blocker and
          // cannot mutate the shared Customer until expiration is confirmed.
        }
      };

      const claimOrderAndConfirmRotation = async () => {
        const claimedOrder = await claimOrder();
        if (claimedOrder.rotatedSessionId) {
          let superseded: Stripe.Checkout.Session;
          try {
            superseded = await stripe.checkout.sessions.expire(
              claimedOrder.rotatedSessionId,
            );
          } catch {
            try {
              superseded = await stripe.checkout.sessions.retrieve(
                claimedOrder.rotatedSessionId,
              );
            } catch {
              throw new HttpError(
                409,
                "Die vorherige Zahlungssitzung wird noch sicher geprüft. Bitte starte keine zweite Zahlung und versuche es gleich erneut.",
                "payment_processing",
              );
            }
          }

          let localSupersededOrderStatus: string | null = null;
          if (
            superseded.status === "complete" &&
            superseded.payment_status !== "paid"
          ) {
            const { data: supersededOrder, error: supersededOrderError } =
              await admin
                .from("orders")
                .select("payment_status")
                .eq("stripe_checkout_session_id", claimedOrder.rotatedSessionId)
                .maybeSingle();
            localSupersededOrderStatus = supersededOrderError
              ? null
              : (supersededOrder?.payment_status ?? null);
          }
          if (
            !supersededCheckoutSessionCanRelease(
              superseded,
              localSupersededOrderStatus,
            )
          ) {
            throw new HttpError(
              409,
              "Die vorherige Zahlung wird noch verarbeitet. Bitte starte keine zweite Zahlung.",
              "payment_processing",
            );
          }
          const { data: confirmed, error: confirmationError } = await admin.rpc(
            "confirm_checkout_session_rotation",
            {
              checkout_order_id: claimedOrder.id,
              superseded_session_id: claimedOrder.rotatedSessionId,
            },
          );
          if (confirmationError || confirmed !== true) {
            throw new HttpError(
              503,
              "Die vorherige Zahlungssitzung konnte nicht sicher abgeschlossen werden.",
            );
          }
        }
        return claimedOrder;
      };

      let order = await claimOrderAndConfirmRotation();
      let session: Stripe.Checkout.Session | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const metadata = {
          user_id: user.id,
          course_id: courseResult.data.id,
          course_version: courseResult.data.version,
          order_id: order.id,
          price_id: product.priceId,
          billing_fingerprint: billingFingerprint,
        };
        let candidate: Stripe.Checkout.Session;
        try {
          if (order.sessionId) {
            candidate = await stripe.checkout.sessions.retrieve(
              order.sessionId,
            );
          } else {
            const recovered = await recoverUnlinkedCheckoutSession(order.id);
            if (recovered) {
              candidate = recovered;
            } else {
              await synchronizeCustomerAndProfile(order.id);
              await renewCheckoutLease();
              try {
                candidate = await stripe.checkout.sessions.create(
                  {
                    ui_mode: "elements",
                    mode: "payment",
                    customer: resolvedCustomerId,
                    customer_update: { address: "auto", name: "auto" },
                    billing_address_collection: "required",
                    automatic_tax: {
                      enabled: envFlag("STRIPE_AUTOMATIC_TAX", false),
                    },
                    invoice_creation: {
                      enabled: true,
                      invoice_data: {
                        metadata,
                        ...(isBusiness && contactPerson
                          ? {
                              custom_fields: [
                                {
                                  name: "Ansprechpartner",
                                  value: contactPerson,
                                },
                              ],
                            }
                          : {}),
                      },
                    },
                    line_items: [{ price: product.priceId, quantity: 1 }],
                    client_reference_id: user.id,
                    metadata,
                    payment_intent_data: { metadata },
                    locale: "de",
                    return_url: `${getSiteUrl()}/zahlung-erfolgreich?session_id={CHECKOUT_SESSION_ID}`,
                  },
                  { idempotencyKey: `checkout-session-${order.id}` },
                );
              } catch {
                const createdDespiteError =
                  await recoverUnlinkedCheckoutSession(order.id);
                if (!createdDespiteError) {
                  throw new Error(
                    "Stripe session creation was not recoverable.",
                  );
                }
                candidate = createdDespiteError;
              }
            }
          }
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            502,
            "Der sichere Zahlungsbereich konnte nicht von Stripe geladen werden.",
            "stripe_session_unavailable",
          );
        }

        if (
          !order.sessionId &&
          !(await linkCheckoutSession(order.id, candidate.id))
        ) {
          // Keep the local order pending. A retry will rediscover this remote
          // Session before any shared-Customer mutation and can retry the CAS.
          throw new HttpError(
            503,
            "Die Zahlungssitzung konnte nicht sicher gespeichert werden.",
          );
        }

        const candidateCustomerId =
          typeof candidate.customer === "string"
            ? candidate.customer
            : candidate.customer?.id;
        const belongsToOrder =
          candidateCustomerId === resolvedCustomerId &&
          candidate.client_reference_id === user.id &&
          candidate.metadata?.user_id === user.id &&
          candidate.metadata?.course_id === courseResult.data.id &&
          candidate.metadata?.order_id === order.id &&
          candidate.metadata?.price_id === product.priceId &&
          candidate.metadata?.billing_fingerprint === billingFingerprint;
        const disposition = belongsToOrder
          ? checkoutSessionDisposition(candidate)
          : "rotate";

        if (disposition === "processing") {
          throw new HttpError(
            409,
            "Deine Zahlung wird bereits bestätigt.",
            "payment_processing",
          );
        }
        if (disposition === "rotate") {
          await expireStripeSession(candidate);
          await expireOrder(order.id);
          if (attempt === 2) {
            throw new HttpError(
              502,
              "Der sichere Zahlungsbereich konnte nicht geladen werden.",
              "stripe_session_invalid",
            );
          }
          order = await claimOrderAndConfirmRotation();
          continue;
        }

        session = candidate;
        break;
      }

      if (!session?.client_secret) {
        throw new HttpError(
          502,
          "Der sichere Zahlungsbereich konnte nicht geladen werden.",
          "stripe_session_invalid",
        );
      }

      const { error: consentError } = await admin
        .from("consent_records")
        .insert([
          {
            user_id: user.id,
            consent_type: "terms_and_privacy",
            consent_version: expectedConsentVersion,
            granted: true,
            proof: { orderId: order.id, legalTextHash },
          },
          {
            user_id: user.id,
            consent_type: "early_access",
            consent_version: expectedConsentVersion,
            granted: true,
            proof: { orderId: order.id, legalTextHash },
          },
        ]);
      if (consentError) {
        throw new HttpError(
          503,
          "Die erforderlichen Einwilligungsnachweise konnten nicht gespeichert werden.",
        );
      }

      return Response.json(
        {
          clientSecret: session.client_secret,
          sessionId: session.id,
          product: {
            name: product.name,
            unitAmount: product.unitAmount,
            currency: product.currency,
            taxBehavior: product.taxBehavior,
          },
          totals: getCheckoutTotals(session, product.taxBehavior),
        },
        { status: 201, headers: noStoreHeaders() },
      );
    } finally {
      await admin.rpc("release_checkout_customer_lease", {
        lease_user_id: user.id,
        requested_lease_token: leaseToken,
      });
    }
  } catch (error) {
    return jsonError(error);
  }
}
