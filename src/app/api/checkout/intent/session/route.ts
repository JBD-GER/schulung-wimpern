import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import {
  createBillingFingerprint,
  normalizeTaxId,
} from "@/lib/billing-fingerprint";
import {
  createCheckoutContractSnapshot,
  readCheckoutContractSnapshot,
} from "@/data/checkout-legal";
import { envFlag, getSiteUrl, requireEnv } from "@/lib/env";
import { getCurrentUser } from "@/lib/server/auth";
import { requireStripeProduct } from "@/lib/server/catalog";
import {
  refreshCheckoutIntentCookie,
  requireCheckoutIntent,
  resolveAuthUserByEmail,
} from "@/lib/server/checkout-intent";
import { getCheckoutTotals } from "@/lib/server/checkout-totals";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getReleaseContract } from "@/lib/server/release";
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

export const maxDuration = 60;

function checkoutSessionMatchesIntent(
  session: Stripe.Checkout.Session,
  intent: {
    id: string;
    course_id: string;
    course_version: string;
    stripe_price_id: string;
    billing_fingerprint: string | null;
    stripe_customer_id: string | null;
    consent_snapshot: Record<string, unknown>;
  },
): boolean {
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer?.id ?? null);
  return (
    session.client_reference_id === intent.id &&
    session.metadata?.checkout_intent_id === intent.id &&
    session.metadata?.course_id === intent.course_id &&
    session.metadata?.course_version === intent.course_version &&
    session.metadata?.price_id === intent.stripe_price_id &&
    session.metadata?.billing_fingerprint === intent.billing_fingerprint &&
    session.metadata?.legal_text_hash ===
      intent.consent_snapshot?.legalTextHash &&
    session.metadata?.terms_version === intent.consent_snapshot?.termsVersion &&
    customerId === intent.stripe_customer_id
  );
}

async function expireConfirmedUnboundSession(
  stripe: ReturnType<typeof getStripe>,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.status !== "open" || session.payment_status === "paid") return;
  try {
    await stripe.checkout.sessions.expire(session.id);
  } catch {
    // This is compensating cleanup after the database has confirmed that the
    // remote object is not linked. The original binding error remains the
    // authoritative failure and the Stripe expiry webhook/retention worker can
    // safely finish a transient cleanup failure.
  }
}

async function reconcileExpiredSiblingPayment(
  admin: ReturnType<typeof getSupabaseAdmin>,
  stripe: ReturnType<typeof getStripe>,
  intent: { id: string; email: string; course_id: string },
): Promise<void> {
  const { data: blocker, error: blockerError } = await admin
    .from("checkout_intents")
    .select(
      "id,status,paid_at,stripe_checkout_session_id,preparation_lease_expires_at",
    )
    .neq("id", intent.id)
    .eq("email", intent.email)
    .eq("course_id", intent.course_id)
    .in("status", ["processing", "open", "paid", "provisioning"])
    .maybeSingle();
  if (blockerError) {
    throw new HttpError(
      503,
      "Ein bestehender Zahlungsversuch kann gerade nicht sicher geprüft werden.",
      "checkout_blocker_lookup_failed",
    );
  }
  if (!blocker) return;
  if (blocker.paid_at || ["paid", "provisioning"].includes(blocker.status)) {
    throw new HttpError(
      409,
      "Für diese Buchung wird bereits eine Zahlung bestätigt. Bitte öffne keine zweite Zahlung.",
      "checkout_payment_pending",
    );
  }
  if (!blocker.stripe_checkout_session_id) {
    const leaseExpiresAt = blocker.preparation_lease_expires_at
      ? new Date(blocker.preparation_lease_expires_at).getTime()
      : 0;
    if (blocker.status === "processing" && leaseExpiresAt <= Date.now()) {
      let retirementQuery = admin
        .from("checkout_intents")
        .update({ status: "expired" })
        .eq("id", blocker.id)
        .eq("status", "processing")
        .is("paid_at", null)
        .is("stripe_checkout_session_id", null);
      retirementQuery = blocker.preparation_lease_expires_at
        ? retirementQuery.eq(
            "preparation_lease_expires_at",
            blocker.preparation_lease_expires_at,
          )
        : retirementQuery.is("preparation_lease_expires_at", null);
      const { data: retired, error: retirementError } = await retirementQuery
        .select("id")
        .maybeSingle();
      if (retirementError) {
        throw new HttpError(
          503,
          "Der abgebrochene Zahlungsversuch konnte nicht freigegeben werden.",
          "checkout_blocker_release_failed",
        );
      }
      if (!retired) {
        throw new HttpError(
          409,
          "Der vorherige Checkout wurde inzwischen fortgesetzt. Bitte versuche es gleich erneut.",
          "checkout_state_changed",
        );
      }
      return;
    }
    const retryAfter = leaseExpiresAt
      ? Math.max(1, Math.ceil((leaseExpiresAt - Date.now()) / 1000))
      : 2;
    throw new HttpError(
      blocker.status === "processing" ? 409 : 503,
      blocker.status === "processing"
        ? `Ein vorheriger Checkout wird noch vorbereitet. Bitte versuche es in etwa ${retryAfter} Sekunden erneut.`
        : "Ein vorheriger Checkout kann gerade nicht wiederhergestellt werden.",
      blocker.status === "processing"
        ? "checkout_in_progress"
        : "checkout_blocker_unavailable",
    );
  }

  let remoteSession: Stripe.Checkout.Session;
  try {
    remoteSession = await stripe.checkout.sessions.retrieve(
      blocker.stripe_checkout_session_id,
    );
  } catch {
    throw new HttpError(
      502,
      "Ein vorheriger Zahlungsversuch konnte nicht bei Stripe geprüft werden.",
      "checkout_blocker_lookup_failed",
    );
  }
  if (
    remoteSession.id !== blocker.stripe_checkout_session_id ||
    remoteSession.client_reference_id !== blocker.id ||
    remoteSession.metadata?.checkout_intent_id !== blocker.id
  ) {
    throw new HttpError(
      503,
      "Ein vorheriger Zahlungsversuch ist inkonsistent und wurde nicht automatisch verändert.",
      "checkout_blocker_mismatch",
    );
  }
  if (
    remoteSession.status === "expired" &&
    remoteSession.payment_status === "unpaid"
  ) {
    const { data: retired, error: retirementError } = await admin
      .from("checkout_intents")
      .update({ status: "expired" })
      .eq("id", blocker.id)
      .eq("stripe_checkout_session_id", remoteSession.id)
      .is("paid_at", null)
      .in("status", ["processing", "open"])
      .select("id")
      .maybeSingle();
    if (retirementError) {
      throw new HttpError(
        503,
        "Der abgelaufene Zahlungsversuch konnte nicht freigegeben werden.",
        "checkout_blocker_release_failed",
      );
    }
    if (!retired) {
      const { data: current, error: currentError } = await admin
        .from("checkout_intents")
        .select("status,paid_at")
        .eq("id", blocker.id)
        .maybeSingle();
      if (
        currentError ||
        !current ||
        current.paid_at ||
        current.status !== "expired"
      ) {
        throw new HttpError(
          409,
          "Der vorherige Zahlungsversuch hat inzwischen seinen Zustand geändert. Bitte lade den Checkout neu.",
          "checkout_state_changed",
        );
      }
    }
    return;
  }
  if (
    remoteSession.status === "complete" ||
    remoteSession.payment_status === "paid"
  ) {
    throw new HttpError(
      409,
      "Die vorherige Zahlung wird bereits verarbeitet. Bitte öffne keine zweite Zahlung.",
      "checkout_payment_pending",
    );
  }
  throw new HttpError(
    409,
    "Es wurde ein früherer Zahlungsbereich gefunden. Gehe zurück zu den Teilnehmerdaten und bestätige dort dieselben Daten und dein Passwort; anschließend wird dieser sicher wiederhergestellt.",
    "checkout_session_already_open",
  );
}

export async function GET(request: Request) {
  try {
    const intent = await requireCheckoutIntent();
    await enforceRateLimit({
      bucket: "checkout-intent-totals",
      subject: intent.id,
      maximum: 60,
      windowSeconds: 600,
    });
    const sessionId = new URL(request.url).searchParams
      .get("session_id")
      ?.trim();
    if (
      !sessionId ||
      intent.stripe_checkout_session_id !== sessionId ||
      !/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)
    ) {
      throw new HttpError(404, "Die Zahlungssitzung wurde nicht gefunden.");
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
      );
    }
    if (!checkoutSessionMatchesIntent(session, intent)) {
      throw new HttpError(
        403,
        "Die Zahlungssitzung gehört nicht zu diesem Checkout.",
      );
    }
    const sessionPrice = session.line_items?.data[0]?.price;
    if (!sessionPrice || sessionPrice.id !== intent.stripe_price_id) {
      throw new HttpError(409, "Die Stripe-Preisbindung ist ungültig.");
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
  let lease:
    | {
        intentId: string;
        token: string;
        admin: ReturnType<typeof getSupabaseAdmin>;
      }
    | undefined;
  try {
    assertSameOrigin(request);
    const intent = await requireCheckoutIntent();
    if (
      !intent.identity_authorized_at ||
      !["ready", "email_verified", "open", "processing"].includes(intent.status)
    ) {
      throw new HttpError(
        403,
        "Die Teilnehmerdaten dieses Checkouts sind nicht freigegeben.",
        "checkout_identity_required",
      );
    }
    await enforceRateLimit({
      bucket: "checkout-intent-session",
      subject: intent.id,
      maximum: 6,
      windowSeconds: 1800,
    });
    const input = checkoutSchema.parse(await readJson(request));
    const [currentUser, product, courseResult] = await Promise.all([
      getCurrentUser(),
      requireStripeProduct(),
      getSupabaseAdmin()
        .from("courses")
        .select("id,version")
        .eq("id", intent.course_id)
        .eq("status", "published")
        .single(),
    ]);
    if (courseResult.error || !courseResult.data) {
      throw new HttpError(503, "Der Kurs ist derzeit nicht verfügbar.");
    }
    const admin = getSupabaseAdmin();
    if (intent.identity_mode === "existing_authenticated") {
      if (
        !intent.auth_user_id ||
        !currentUser ||
        currentUser.id !== intent.auth_user_id ||
        currentUser.email?.trim().toLowerCase() !== intent.email
      ) {
        throw new HttpError(
          401,
          "Bitte melde dich erneut mit dem Konto an, das diese Buchung begonnen hat.",
          "checkout_login_required",
        );
      }
    } else if (intent.identity_mode === "new_account_password") {
      if (intent.auth_user_id || !intent.signup_password_hash) {
        throw new HttpError(
          409,
          "Die Zugangsdaten dieses neuen Kontos sind inkonsistent.",
          "checkout_identity_conflict",
        );
      }
      if (currentUser) {
        throw new HttpError(
          409,
          "In diesem Browser ist inzwischen ein anderes Konto angemeldet. Bitte starte den Checkout neu.",
          "checkout_account_conflict",
        );
      }
      const discoveredUserId = await resolveAuthUserByEmail(intent.email);
      if (discoveredUserId) {
        throw new HttpError(
          409,
          "Für diese E-Mail-Adresse besteht inzwischen ein Konto. Bitte melde dich an und starte den Checkout erneut.",
          "checkout_login_required",
        );
      }
    } else {
      // Already-issued verification links may still finish during the short
      // migration window. This compatibility branch is intentionally limited
      // to legacy intents that did prove control of the mailbox.
      if (!intent.email_verified_at) {
        throw new HttpError(
          403,
          "Der ältere Checkout ist noch nicht bestätigt.",
          "checkout_identity_required",
        );
      }
      if (!intent.auth_user_id) {
        const discoveredUserId = await resolveAuthUserByEmail(intent.email);
        if (discoveredUserId) {
          const { data: discovered, error: discoveredError } =
            await admin.auth.admin.getUserById(discoveredUserId);
          if (
            discoveredError ||
            !discovered.user ||
            !discovered.user.email_confirmed_at ||
            discovered.user.email?.trim().toLowerCase() !== intent.email
          ) {
            throw new HttpError(
              503,
              "Das bestehende Teilnehmerkonto kann nicht sicher zugeordnet werden.",
            );
          }
          const { data: bound, error: bindingError } = await admin
            .from("checkout_intents")
            .update({ auth_user_id: discoveredUserId })
            .eq("id", intent.id)
            .is("auth_user_id", null)
            .eq("identity_mode", "legacy_email_verified")
            .not("email_verified_at", "is", null)
            .in("status", ["email_verified", "open", "processing"])
            .select("id")
            .maybeSingle();
          if (bindingError || !bound) {
            throw new HttpError(
              503,
              "Das bestehende Teilnehmerkonto konnte nicht atomar gebunden werden.",
            );
          }
          intent.auth_user_id = discoveredUserId;
        }
      }
      if (
        intent.auth_user_id &&
        (!currentUser || currentUser.id !== intent.auth_user_id)
      ) {
        throw new HttpError(
          401,
          "Bitte melde dich erneut mit dem bestätigten Konto an.",
          "checkout_login_required",
        );
      }
    }
    if (intent.auth_user_id) {
      const { data: existingEnrollment, error: enrollmentError } =
        await getSupabaseAdmin()
          .from("enrollments")
          .select("status")
          .eq("user_id", intent.auth_user_id)
          .eq("course_id", intent.course_id)
          .in("status", ["pending_payment", "active", "completed"])
          .maybeSingle();
      if (enrollmentError) {
        throw new HttpError(
          503,
          "Der bestehende Kurszugang kann gerade nicht geprüft werden.",
        );
      }
      if (
        existingEnrollment?.status === "active" ||
        existingEnrollment?.status === "completed"
      ) {
        throw new HttpError(
          409,
          "Dieses Teilnehmerkonto besitzt bereits Zugang zur Schulung.",
          "already_enrolled",
        );
      }
      if (existingEnrollment?.status === "pending_payment") {
        throw new HttpError(
          409,
          "Für dieses Teilnehmerkonto läuft bereits ein älterer Checkout. Bitte schließe ihn zuerst ab oder wende dich an den Support.",
          "legacy_checkout_in_progress",
        );
      }
    }
    if (
      product.priceId !== intent.stripe_price_id ||
      courseResult.data.version !== intent.course_version
    ) {
      throw new HttpError(
        409,
        "Kurs oder Preis wurden aktualisiert. Bitte beginne den Checkout erneut.",
        "checkout_catalog_changed",
      );
    }
    const expectedConsentVersion = requireEnv("CHECKOUT_CONSENT_VERSION");
    if (input.consentVersion !== expectedConsentVersion) {
      throw new HttpError(
        409,
        "Die Rechtstexte wurden aktualisiert. Bitte lade den Checkout neu.",
        "consent_version_changed",
      );
    }

    const isBusiness = input.billingType === "business";
    const companyName = isBusiness ? (input.companyName?.trim() ?? null) : null;
    const contactPerson = isBusiness
      ? (input.contactPerson?.trim() ?? null)
      : null;
    const legalForm = isBusiness ? (input.legalForm?.trim() ?? null) : null;
    const taxId = isBusiness ? (input.taxId?.trim() ?? null) : null;
    const invoiceName = isBusiness
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
      invoiceName,
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
      taxId,
      consentVersion: expectedConsentVersion,
      productName: product.name,
      unitAmount: product.unitAmount,
      currency: product.currency,
      taxBehavior: product.taxBehavior,
      paymentMethodLabel: "Kredit- oder Debitkarte über Stripe",
    };
    const billingFingerprint = createBillingFingerprint({
      schemaVersion: 2,
      checkoutIntentId: intent.id,
      billingEmail: intent.email,
      courseId: intent.course_id,
      courseVersion: intent.course_version,
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
    const legalTextHash = requireEnv("CHECKOUT_LEGAL_TEXT_HASH");
    const releasedProvider = getReleaseContract().legal.releasedProvider;
    if (!releasedProvider) {
      throw new HttpError(
        503,
        "Die rechtliche Verkaufsfreigabe ist nicht mehr gültig.",
        "legal_release_changed",
      );
    }
    const existingContractSnapshot = readCheckoutContractSnapshot(
      intent.consent_snapshot?.contract,
    );
    const consentSnapshot = intent.stripe_checkout_session_id
      ? intent.consent_snapshot
      : {
          termsVersion: expectedConsentVersion,
          legalTextHash,
          termsAccepted: true,
          earlyAccessAccepted: true,
          contract: createCheckoutContractSnapshot({
            acceptedAt: new Date().toISOString(),
            siteUrl: getSiteUrl(),
            termsVersion: expectedConsentVersion,
            legalTextHash,
            provider: releasedProvider,
          }),
        };
    if (
      intent.stripe_checkout_session_id &&
      (intent.billing_fingerprint !== billingFingerprint ||
        intent.consent_snapshot?.termsVersion !== expectedConsentVersion ||
        intent.consent_snapshot?.legalTextHash !== legalTextHash ||
        intent.consent_snapshot?.termsAccepted !== true ||
        intent.consent_snapshot?.earlyAccessAccepted !== true ||
        !existingContractSnapshot ||
        existingContractSnapshot.termsVersion !== expectedConsentVersion ||
        existingContractSnapshot.legalTextHash !== legalTextHash)
    ) {
      throw new HttpError(
        409,
        "Rechnungsdaten oder Einwilligungen wurden nach Öffnen der Zahlung geändert. Bitte brich den bisherigen Checkout ab und starte neu.",
        "checkout_session_immutable",
      );
    }

    const leaseToken = randomUUID();
    const stripe = getStripe();
    await reconcileExpiredSiblingPayment(admin, stripe, intent);
    let { data: acquired, error: leaseError } = await admin.rpc(
      "acquire_checkout_intent_preparation",
      {
        target_intent_id: intent.id,
        expected_browser_token_hash: intent.browser_token_hash,
        requested_lease_token: leaseToken,
        lease_ttl_seconds: 90,
      },
    );
    if (leaseError?.code === "23505") {
      await reconcileExpiredSiblingPayment(admin, stripe, intent);
      ({ data: acquired, error: leaseError } = await admin.rpc(
        "acquire_checkout_intent_preparation",
        {
          target_intent_id: intent.id,
          expected_browser_token_hash: intent.browser_token_hash,
          requested_lease_token: leaseToken,
          lease_ttl_seconds: 90,
        },
      ));
    }
    if (leaseError) {
      throw new HttpError(
        503,
        "Die sichere Zahlung kann gerade nicht in der Datenbank vorbereitet werden. Bitte versuche es erneut.",
        "checkout_preparation_unavailable",
      );
    }
    if (acquired !== true) {
      const { data: current, error: currentError } = await admin
        .from("checkout_intents")
        .select("status,preparation_lease_expires_at")
        .eq("id", intent.id)
        .eq("browser_token_hash", intent.browser_token_hash)
        .maybeSingle();
      if (currentError) {
        throw new HttpError(
          503,
          "Der aktuelle Checkout-Zustand kann gerade nicht geprüft werden.",
          "checkout_preparation_unavailable",
        );
      }
      const retryAfter = current?.preparation_lease_expires_at
        ? Math.max(
            1,
            Math.ceil(
              (new Date(current.preparation_lease_expires_at).getTime() -
                Date.now()) /
                1000,
            ),
          )
        : 2;
      if (current?.status !== "processing") {
        throw new HttpError(
          409,
          "Der Checkout-Zustand hat sich geändert. Bitte lade den Checkout neu.",
          "checkout_state_changed",
        );
      }
      return Response.json(
        {
          ok: false,
          error: "checkout_in_progress",
          message:
            "Dieser Checkout wird bereits vorbereitet. Bitte versuche es gleich erneut.",
          retryAfter,
        },
        {
          status: 409,
          headers: noStoreHeaders({ "Retry-After": String(retryAfter) }),
        },
      );
    }
    lease = { intentId: intent.id, token: leaseToken, admin };

    const { data: prepared, error: prepareError } = await admin
      .from("checkout_intents")
      .update({
        billing_snapshot: billingSnapshot,
        consent_snapshot: consentSnapshot,
        billing_fingerprint: billingFingerprint,
        business_purchase: isBusiness,
      })
      .eq("id", intent.id)
      .eq("preparation_lease_token", leaseToken)
      .eq("status", "processing")
      .select("stripe_checkout_session_id,stripe_customer_id")
      .single();
    if (prepareError || !prepared) {
      throw new HttpError(
        503,
        "Die Rechnungsdaten konnten nicht gebunden werden.",
      );
    }

    let customerId = prepared.stripe_customer_id as string | null;
    if (!customerId && intent.auth_user_id) {
      const { data: mapped, error: mappingError } = await admin
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", intent.auth_user_id)
        .maybeSingle();
      if (mappingError) {
        throw new HttpError(
          503,
          "Das Stripe-Kundenkonto kann nicht geprüft werden.",
        );
      }
      customerId = mapped?.stripe_customer_id ?? null;
      if (customerId) {
        const { data: linkedCustomer, error: customerLinkError } = await admin
          .from("checkout_intents")
          .update({ stripe_customer_id: customerId })
          .eq("id", intent.id)
          .eq("preparation_lease_token", leaseToken)
          .eq("status", "processing")
          .is("stripe_customer_id", null)
          .select("id")
          .maybeSingle();
        if (customerLinkError || !linkedCustomer) {
          throw new HttpError(
            503,
            "Das bestehende Stripe-Kundenkonto konnte nicht gebunden werden.",
          );
        }
      }
    }
    if (!customerId) {
      let customer: Stripe.Customer;
      try {
        customer = await stripe.customers.create(
          {
            email: intent.email,
            metadata: { checkout_origin: "payment_first" },
          },
          { idempotencyKey: `checkout-intent-customer-${intent.id}` },
        );
      } catch {
        throw new HttpError(
          502,
          "Das Stripe-Kundenkonto konnte nicht vorbereitet werden.",
        );
      }
      customerId = customer.id;
      const { data: linkedCustomer, error: customerLinkError } = await admin
        .from("checkout_intents")
        .update({ stripe_customer_id: customerId })
        .eq("id", intent.id)
        .eq("preparation_lease_token", leaseToken)
        .eq("status", "processing")
        .is("stripe_customer_id", null)
        .select("id")
        .maybeSingle();
      if (customerLinkError || !linkedCustomer) {
        throw new HttpError(
          503,
          "Das Stripe-Kundenkonto konnte nicht gebunden werden.",
        );
      }
    }

    const customerMetadata = {
      ...(intent.auth_user_id ? { user_id: intent.auth_user_id } : {}),
      billing_type: input.billingType,
      checkout_origin: "payment_first",
    };
    try {
      await stripe.customers.update(
        customerId,
        {
          email: intent.email,
          name: invoiceName,
          address,
          preferred_locales: ["de"],
          metadata: customerMetadata,
        },
        {
          idempotencyKey: `checkout-intent-customer-update-${intent.id}-${billingFingerprint}`,
        },
      );
      await reconcileCustomerTaxIds(
        stripe,
        customerId,
        desiredTaxId,
        `${intent.id}-${billingFingerprint}`,
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        desiredTaxId ? 400 : 502,
        desiredTaxId
          ? "Die Umsatzsteuer-ID konnte nicht bestätigt werden."
          : "Das Stripe-Kundenkonto konnte nicht aktualisiert werden.",
      );
    }

    const metadata = {
      checkout_intent_id: intent.id,
      course_id: intent.course_id,
      course_version: intent.course_version,
      price_id: product.priceId,
      billing_fingerprint: billingFingerprint,
      legal_text_hash: legalTextHash,
      terms_version: expectedConsentVersion,
    };
    let session: Stripe.Checkout.Session;
    let createdRemoteSession = false;
    if (prepared.stripe_checkout_session_id) {
      try {
        session = await stripe.checkout.sessions.retrieve(
          prepared.stripe_checkout_session_id as string,
          { expand: ["line_items.data.price"] },
        );
      } catch {
        throw new HttpError(
          502,
          "Die bestehende Zahlungssitzung konnte nicht von Stripe geladen werden.",
          "checkout_session_lookup_failed",
        );
      }
      const preparedIntent = {
        ...intent,
        billing_fingerprint: billingFingerprint,
        stripe_customer_id: customerId,
      };
      if (!checkoutSessionMatchesIntent(session, preparedIntent)) {
        throw new HttpError(
          409,
          "Die bestehende Zahlungssitzung ist inkonsistent.",
        );
      }
      if (session.status === "expired" && session.payment_status === "unpaid") {
        const { data: expired, error: expiryError } = await admin
          .from("checkout_intents")
          .update({ status: "expired" })
          .eq("id", intent.id)
          .eq("preparation_lease_token", leaseToken)
          .eq("status", "processing")
          .eq("stripe_checkout_session_id", session.id)
          .is("paid_at", null)
          .select("id")
          .maybeSingle();
        if (expiryError || !expired) {
          throw new HttpError(
            503,
            "Die abgelaufene Zahlungssitzung konnte nicht sicher geschlossen werden.",
            "checkout_session_expiry_failed",
          );
        }
        throw new HttpError(
          410,
          "Diese Zahlungssitzung ist abgelaufen. Bitte beginne den Checkout erneut.",
          "checkout_session_expired",
        );
      }
      if (session.status === "complete" || session.payment_status === "paid") {
        return Response.json(
          {
            ok: false,
            error: "checkout_payment_pending",
            message:
              "Die Zahlung wird bereits bestätigt. Dein Zugang wird jetzt freigeschaltet.",
            redirectUrl: `/zahlung-erfolgreich?session_id=${encodeURIComponent(session.id)}`,
          },
          { status: 409, headers: noStoreHeaders() },
        );
      }
      if (session.status !== "open" || !session.client_secret) {
        throw new HttpError(
          409,
          "Diese Zahlungssitzung ist bereits abgeschlossen. Bitte beginne erneut.",
          "checkout_session_closed",
        );
      }
    } else {
      try {
        session = await stripe.checkout.sessions.create(
          {
            ui_mode: "elements",
            mode: "payment",
            payment_method_types: ["card"],
            customer: customerId,
            // Step two already validated the complete invoice address and the
            // Customer was updated immediately above. Tax must use that saved
            // address. Waiting for Custom Checkout to collect it again leaves
            // automatic tax at `requires_location_inputs` before the Payment
            // Element is mounted.
            customer_update: { address: "never", name: "never" },
            billing_address_collection: "auto",
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
                        { name: "Ansprechpartner", value: contactPerson },
                      ],
                    }
                  : {}),
              },
            },
            line_items: [{ price: product.priceId, quantity: 1 }],
            client_reference_id: intent.id,
            metadata,
            payment_intent_data: { metadata },
            locale: "de",
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
            return_url: `${getSiteUrl()}/zahlung-erfolgreich?session_id={CHECKOUT_SESSION_ID}`,
          },
          { idempotencyKey: `checkout-intent-session-${intent.id}` },
        );
        createdRemoteSession = true;
      } catch {
        throw new HttpError(
          502,
          "Der sichere Zahlungsbereich konnte nicht geladen werden.",
        );
      }
      const { data: linked, error: linkError } = await admin
        .from("checkout_intents")
        .update({
          stripe_checkout_session_id: session.id,
          status: "open",
        })
        .eq("id", intent.id)
        .eq("preparation_lease_token", leaseToken)
        .eq("status", "processing")
        .is("stripe_checkout_session_id", null)
        .select("id")
        .maybeSingle();
      if (linkError || !linked) {
        const { data: currentLink, error: currentLinkError } = await admin
          .from("checkout_intents")
          .select("stripe_checkout_session_id,status")
          .eq("id", intent.id)
          .maybeSingle();
        const linkWasPersisted =
          !currentLinkError &&
          currentLink?.stripe_checkout_session_id === session.id &&
          ["processing", "open"].includes(currentLink.status);
        if (linkWasPersisted) {
          // The update response may have been lost after PostgreSQL committed.
          // Read-back confirmation makes the retry idempotent.
        } else {
          if (!currentLinkError && createdRemoteSession) {
            await expireConfirmedUnboundSession(stripe, session);
          }
          throw new HttpError(
            503,
            "Die Zahlungssitzung konnte nicht gebunden werden.",
          );
        }
      }
    }
    const browserBindingExpiresAt = new Date(
      Math.max(
        new Date(intent.expires_at).getTime(),
        Date.now() + 48 * 60 * 60 * 1000,
      ),
    );
    const { data: extended, error: extensionError } = await admin
      .from("checkout_intents")
      .update({ expires_at: browserBindingExpiresAt.toISOString() })
      .eq("id", intent.id)
      .eq("preparation_lease_token", leaseToken)
      .eq("stripe_checkout_session_id", session.id)
      .in("status", ["processing", "open"])
      .select("id")
      .maybeSingle();
    if (extensionError || !extended) {
      const { data: currentExtension, error: currentExtensionError } =
        await admin
          .from("checkout_intents")
          .select("status,stripe_checkout_session_id,expires_at")
          .eq("id", intent.id)
          .maybeSingle();
      const extensionWasPersisted =
        !currentExtensionError &&
        currentExtension?.stripe_checkout_session_id === session.id &&
        ["processing", "open"].includes(currentExtension.status) &&
        new Date(currentExtension.expires_at).getTime() >=
          browserBindingExpiresAt.getTime();
      if (!extensionWasPersisted) {
        throw new HttpError(
          503,
          "Die sichere Rückkehr aus der Zahlung konnte nicht vorbereitet werden.",
          "checkout_binding_extension_failed",
        );
      }
    }
    await refreshCheckoutIntentCookie(browserBindingExpiresAt);
    if (!session.client_secret) {
      throw new HttpError(
        502,
        "Stripe hat kein sicheres Zahlungsformular geliefert.",
      );
    }
    return Response.json(
      {
        clientSecret: session.client_secret,
        sessionId: session.id,
        expiresAt: session.expires_at,
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
  } catch (error) {
    return jsonError(error);
  } finally {
    if (lease) {
      await lease.admin.rpc("release_checkout_intent_preparation", {
        target_intent_id: lease.intentId,
        requested_lease_token: lease.token,
      });
    }
  }
}
