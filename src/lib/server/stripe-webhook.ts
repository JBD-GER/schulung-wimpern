import "server-only";

import { createHash } from "node:crypto";

import type Stripe from "stripe";

import { normalizeTaxId } from "@/lib/billing-fingerprint";
import { getAdminEmails, optionalEnv, requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { provisionPaidCheckoutIntent } from "./checkout-intent";
import { sendEnrollmentActivatedEmail, sendTransactionalEmail } from "./email";
import { HttpError } from "./http";
import { getStripe } from "./stripe";

const expandableId = (
  value: { id: string } | string | null | undefined,
): string => (typeof value === "string" ? value : (value?.id ?? ""));

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function customerMatchesBillingSnapshot(
  customer: Stripe.Customer,
  snapshot: Record<string, unknown>,
): boolean {
  const billingAddress =
    snapshot.billingAddress &&
    typeof snapshot.billingAddress === "object" &&
    !Array.isArray(snapshot.billingAddress)
      ? (snapshot.billingAddress as Record<string, unknown>)
      : {};
  return (
    normalizedText(customer.name) === normalizedText(snapshot.invoiceName) &&
    normalizedText(customer.address?.line1) ===
      normalizedText(billingAddress.street) &&
    normalizedText(customer.address?.postal_code) ===
      normalizedText(billingAddress.postalCode) &&
    normalizedText(customer.address?.city) ===
      normalizedText(billingAddress.city) &&
    normalizedText(customer.address?.country).toUpperCase() ===
      normalizedText(billingAddress.country).toUpperCase()
  );
}

function invoiceMatchesBillingSnapshot(
  invoice: Stripe.Invoice,
  snapshot: Record<string, unknown>,
): boolean {
  const billingAddress =
    snapshot.billingAddress &&
    typeof snapshot.billingAddress === "object" &&
    !Array.isArray(snapshot.billingAddress)
      ? (snapshot.billingAddress as Record<string, unknown>)
      : {};
  const expectedTaxId = normalizedText(snapshot.taxId);
  const invoiceTaxIds = (invoice.customer_tax_ids ?? []).map((taxId) =>
    normalizeTaxId(normalizedText(taxId.value)),
  );
  return (
    normalizedText(invoice.customer_name) ===
      normalizedText(snapshot.invoiceName) &&
    normalizedText(invoice.customer_address?.line1) ===
      normalizedText(billingAddress.street) &&
    normalizedText(invoice.customer_address?.postal_code) ===
      normalizedText(billingAddress.postalCode) &&
    normalizedText(invoice.customer_address?.city) ===
      normalizedText(billingAddress.city) &&
    normalizedText(invoice.customer_address?.country).toUpperCase() ===
      normalizedText(billingAddress.country).toUpperCase() &&
    (expectedTaxId
      ? invoiceTaxIds.includes(normalizeTaxId(expectedTaxId))
      : invoiceTaxIds.length === 0)
  );
}

export const REQUIRED_STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "invoice.paid",
  "refund.created",
  "refund.updated",
  "charge.dispute.created",
] as const;

async function fulfillPaymentFirstCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const intentId = session.metadata?.checkout_intent_id;
  const courseId = session.metadata?.course_id;
  const courseVersion = session.metadata?.course_version;
  const priceId = session.metadata?.price_id;
  const billingFingerprint = session.metadata?.billing_fingerprint;
  const legalTextHash = session.metadata?.legal_text_hash;
  const termsVersion = session.metadata?.terms_version;
  if (
    !intentId ||
    !uuidPattern.test(intentId) ||
    !courseId ||
    !courseVersion ||
    !priceId ||
    !billingFingerprint ||
    !/^[a-f0-9]{64}$/.test(billingFingerprint) ||
    !legalTextHash ||
    !/^sha256-[a-f0-9]{64}$/.test(legalTextHash) ||
    !termsVersion
  ) {
    throw new HttpError(
      400,
      "Stripe-Checkout-Intent-Metadaten sind unvollständig.",
      "invalid_checkout_intent_metadata",
    );
  }
  const admin = getSupabaseAdmin();
  const { data: intent, error: intentError } = await admin
    .from("checkout_intents")
    .select(
      "id,course_id,course_version,email,stripe_checkout_session_id,stripe_payment_intent_id,stripe_customer_id,stripe_invoice_id,stripe_price_id,billing_fingerprint,billing_snapshot,consent_snapshot,amount_total,currency,identity_authorized_at,status",
    )
    .eq("id", intentId)
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (intentError) {
    throw new HttpError(
      503,
      "Der Checkout-Intent konnte nicht geladen werden.",
    );
  }
  if (
    !intent ||
    !intent.identity_authorized_at ||
    intent.course_id !== courseId ||
    intent.course_version !== courseVersion ||
    intent.stripe_price_id !== priceId ||
    intent.billing_fingerprint !== billingFingerprint ||
    intent.billing_snapshot?.billingFingerprint !== billingFingerprint ||
    intent.consent_snapshot?.legalTextHash !== legalTextHash ||
    intent.consent_snapshot?.termsVersion !== termsVersion
  ) {
    throw new HttpError(
      400,
      "Der bezahlte Checkout passt nicht zum unveränderten Intent.",
      "checkout_intent_mismatch",
    );
  }
  const lineItems = session.line_items?.data ?? [];
  const linePriceId =
    lineItems.length === 1 ? expandableId(lineItems[0]?.price) : "";
  if (linePriceId !== priceId || lineItems[0]?.quantity !== 1) {
    throw new HttpError(
      400,
      "Die bezahlte Position passt nicht zum Checkout-Intent.",
      "price_mismatch",
    );
  }
  if (
    session.status !== "complete" ||
    session.mode !== "payment" ||
    session.client_reference_id !== intent.id
  ) {
    throw new HttpError(
      400,
      "Die abgeschlossene Stripe-Sitzung passt nicht zum Checkout-Intent.",
      "checkout_intent_session_mismatch",
    );
  }
  const paymentIntentId = expandableId(session.payment_intent);
  const customerId = expandableId(session.customer);
  const invoiceId = expandableId(session.invoice);
  if (
    !paymentIntentId ||
    !customerId ||
    intent.stripe_customer_id !== customerId ||
    (intent.stripe_payment_intent_id &&
      intent.stripe_payment_intent_id !== paymentIntentId) ||
    (intent.amount_total !== null &&
      intent.amount_total !== session.amount_total) ||
    (intent.currency &&
      intent.currency.toLowerCase() !== (session.currency ?? "").toLowerCase())
  ) {
    throw new HttpError(
      400,
      "Die Zahlung kann dem Checkout-Intent nicht eindeutig zugeordnet werden.",
      "checkout_intent_payment_mismatch",
    );
  }
  const customer = session.customer;
  if (
    typeof customer === "string" ||
    !customer ||
    ("deleted" in customer && customer.deleted) ||
    customer.email?.trim().toLowerCase() !== intent.email ||
    !customerMatchesBillingSnapshot(
      customer,
      intent.billing_snapshot as Record<string, unknown>,
    )
  ) {
    throw new HttpError(
      400,
      "Das Stripe-Kundenkonto passt nicht zum Checkout-Intent.",
      "checkout_intent_customer_mismatch",
    );
  }
  const paymentIntent = session.payment_intent;
  if (
    typeof paymentIntent === "string" ||
    !paymentIntent ||
    paymentIntent.status !== "succeeded" ||
    paymentIntent.id !== paymentIntentId ||
    expandableId(paymentIntent.customer) !== customerId ||
    paymentIntent.amount !== session.amount_total ||
    paymentIntent.currency.toLowerCase() !==
      (session.currency ?? "").toLowerCase() ||
    paymentIntent.metadata?.checkout_intent_id !== intent.id ||
    paymentIntent.metadata?.course_id !== courseId ||
    paymentIntent.metadata?.course_version !== courseVersion ||
    paymentIntent.metadata?.price_id !== priceId ||
    paymentIntent.metadata?.billing_fingerprint !== billingFingerprint ||
    paymentIntent.metadata?.legal_text_hash !== legalTextHash ||
    paymentIntent.metadata?.terms_version !== termsVersion
  ) {
    throw new HttpError(
      400,
      "Der Payment Intent passt nicht zum Checkout-Intent.",
      "checkout_intent_payment_intent_mismatch",
    );
  }

  const { data: recorded, error: recordError } = await admin.rpc(
    "record_paid_checkout_intent",
    {
      target_intent_id: intent.id,
      checkout_session_id: session.id,
      payment_intent_id: paymentIntentId,
      customer_id: customerId,
      invoice_id: invoiceId,
      price_id: priceId,
      billing_fingerprint: billingFingerprint,
      total_amount: session.amount_total ?? 0,
      currency_code: session.currency ?? "",
      total_tax: session.total_details?.amount_tax ?? 0,
    },
  );
  if (recordError || recorded !== intent.id) {
    throw new HttpError(
      503,
      "Die bezahlte Intent-Evidenz konnte nicht gespeichert werden.",
    );
  }
  await provisionPaidCheckoutIntent(intent.id);
}

async function fulfillCheckoutSession(sessionId: string): Promise<void> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price", "invoice", "payment_intent", "customer"],
  });
  if (session.payment_status !== "paid") return;
  if (session.metadata?.checkout_intent_id) {
    await fulfillPaymentFirstCheckoutSession(session);
    return;
  }
  const userId = session.metadata?.user_id;
  const courseId = session.metadata?.course_id;
  const orderId = session.metadata?.order_id;
  const metadataPriceId = session.metadata?.price_id;
  const billingFingerprint = session.metadata?.billing_fingerprint;
  if (
    !userId ||
    !courseId ||
    !orderId ||
    !metadataPriceId ||
    !billingFingerprint ||
    !/^[a-f0-9]{64}$/.test(billingFingerprint)
  ) {
    throw new HttpError(
      400,
      "Stripe-Metadaten sind unvollständig.",
      "invalid_webhook_metadata",
    );
  }
  const admin = getSupabaseAdmin();
  const { data: pendingOrder, error: pendingOrderError } = await admin
    .from("orders")
    .select(
      "id,user_id,course_id,stripe_customer_id,stripe_price_id,stripe_payment_intent_id,amount_total,payment_status,payment_source,billing_snapshot",
    )
    .eq("id", orderId)
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (pendingOrderError)
    throw new HttpError(503, "Die Bestellung konnte nicht geladen werden.");
  if (
    !pendingOrder ||
    pendingOrder.user_id !== userId ||
    pendingOrder.course_id !== courseId ||
    pendingOrder.payment_source !== "stripe"
  ) {
    throw new HttpError(
      400,
      "Die Bestellung konnte nicht sicher zugeordnet werden.",
      "order_mismatch",
    );
  }
  const expectedPriceId = pendingOrder.stripe_price_id;
  if (
    pendingOrder.billing_snapshot?.billingFingerprint !== billingFingerprint
  ) {
    throw new HttpError(
      400,
      "Die Rechnungsdaten entsprechen nicht der gespeicherten Bestellung.",
      "billing_fingerprint_mismatch",
    );
  }
  const lineItems = session.line_items?.data ?? [];
  const linePriceId =
    lineItems.length === 1 ? expandableId(lineItems[0]?.price) : "";
  if (
    metadataPriceId !== expectedPriceId ||
    linePriceId !== expectedPriceId ||
    lineItems[0]?.quantity !== 1
  ) {
    throw new HttpError(
      400,
      "Die bezahlte Position entspricht nicht der gespeicherten Bestellung.",
      "price_mismatch",
    );
  }
  const paymentIntentId = expandableId(session.payment_intent);
  const customerId = expandableId(session.customer);
  if (
    !paymentIntentId ||
    !customerId ||
    pendingOrder.stripe_customer_id !== customerId ||
    (pendingOrder.stripe_payment_intent_id &&
      pendingOrder.stripe_payment_intent_id !== paymentIntentId)
  ) {
    throw new HttpError(
      400,
      "Die Zahlung kann der Bestellung nicht eindeutig zugeordnet werden.",
      "payment_intent_mismatch",
    );
  }
  if (
    pendingOrder.amount_total !== null &&
    pendingOrder.amount_total !== session.amount_total
  ) {
    throw new HttpError(
      400,
      "Der Zahlungsbetrag entspricht nicht der gespeicherten Bestellung.",
      "amount_mismatch",
    );
  }
  const invoiceId = expandableId(session.invoice);
  const { data: fulfillmentData, error } = await admin.rpc(
    "fulfill_stripe_order",
    {
      paid_user_id: userId,
      paid_course_id: courseId,
      checkout_session_id: session.id,
      payment_intent_id: paymentIntentId,
      customer_id: customerId,
      invoice_id: invoiceId,
      price_id: expectedPriceId,
      billing_fingerprint: billingFingerprint,
      total_amount: session.amount_total ?? 0,
      currency_code: session.currency ?? "",
      total_tax: session.total_details?.amount_tax ?? 0,
    },
  );
  const fulfillment = Array.isArray(fulfillmentData)
    ? fulfillmentData[0]
    : fulfillmentData;
  if (error || !fulfillment?.order_id)
    throw new HttpError(503, "Die Kursfreischaltung ist fehlgeschlagen.");
  if (customerId) {
    const { error: customerError } = await admin
      .from("stripe_customers")
      .upsert(
        { user_id: userId, stripe_customer_id: customerId },
        { onConflict: "user_id" },
      );
    if (customerError)
      throw new HttpError(
        503,
        "Die Stripe-Kundenzuordnung konnte nicht gespeichert werden.",
      );
  }
  if (fulfillment.access_granted !== true) return;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("first_name,email")
    .eq("auth_user_id", userId)
    .single();
  if (profileError || !profile)
    throw new HttpError(
      503,
      "Das Profil für die Aktivierung konnte nicht geladen werden.",
    );
  const sent = await sendEnrollmentActivatedEmail({
    userId,
    orderId: fulfillment.order_id as string,
    firstName: profile.first_name,
    email: profile.email,
  });
  if (!sent)
    throw new HttpError(
      503,
      "Die Aktivierungs-E-Mail wartet auf einen erneuten Versand.",
    );
}

async function markCheckoutFailed(
  session: Stripe.Checkout.Session,
  status: "failed" | "expired",
) {
  const checkoutIntentId = session.metadata?.checkout_intent_id;
  if (checkoutIntentId) {
    const courseId = session.metadata?.course_id;
    const priceId = session.metadata?.price_id;
    const billingFingerprint = session.metadata?.billing_fingerprint;
    if (
      !uuidPattern.test(checkoutIntentId) ||
      !courseId ||
      !priceId ||
      !billingFingerprint ||
      !/^[a-f0-9]{64}$/.test(billingFingerprint)
    ) {
      throw new HttpError(
        400,
        "Stripe-Checkout-Intent-Metadaten sind unvollständig.",
        "invalid_checkout_intent_metadata",
      );
    }
    const admin = getSupabaseAdmin();
    const { data: intent, error: lookupError } = await admin
      .from("checkout_intents")
      .select("id,course_id,stripe_price_id,billing_fingerprint")
      .eq("id", checkoutIntentId)
      .eq("stripe_checkout_session_id", session.id)
      .maybeSingle();
    if (lookupError) {
      throw new HttpError(
        503,
        "Der Checkout-Intent konnte nicht geladen werden.",
      );
    }
    if (
      !intent ||
      intent.course_id !== courseId ||
      intent.stripe_price_id !== priceId ||
      intent.billing_fingerprint !== billingFingerprint
    ) {
      throw new HttpError(
        400,
        "Der Checkout-Intent konnte nicht sicher zugeordnet werden.",
        "checkout_intent_mismatch",
      );
    }
    const { data: updated, error } = await admin
      .from("checkout_intents")
      .update({ status })
      .eq("id", intent.id)
      .is("paid_at", null)
      .in("status", ["ready", "email_verified", "open", "processing"])
      .select("id,status,paid_at,auth_user_id,stripe_customer_id")
      .maybeSingle();
    if (error) {
      throw new HttpError(
        503,
        "Der fehlgeschlagene Checkout konnte nicht gespeichert werden.",
      );
    }
    let terminal = updated;
    if (!terminal) {
      const { data: current, error: currentError } = await admin
        .from("checkout_intents")
        .select("id,status,paid_at,auth_user_id,stripe_customer_id")
        .eq("id", intent.id)
        .maybeSingle();
      if (
        currentError ||
        !current ||
        (!current.paid_at && current.status !== status)
      ) {
        throw new HttpError(
          503,
          "Der Checkout-Endstatus konnte nicht eindeutig bestätigt werden.",
        );
      }
      terminal = current;
    }
    // Never delete a remote Customer from this terminal-event snapshot. A
    // genuine paid event can race after the local terminal write, while a
    // Stripe deletion cannot participate in the database transaction. The
    // retention worker reconciles the current remote Session/PaymentIntent
    // state before deleting anonymous unpaid Customers.
    return;
  }
  const userId = session.metadata?.user_id;
  const courseId = session.metadata?.course_id;
  const orderId = session.metadata?.order_id;
  const priceId = session.metadata?.price_id;
  const billingFingerprint = session.metadata?.billing_fingerprint;
  if (
    !userId ||
    !courseId ||
    !orderId ||
    !priceId ||
    !billingFingerprint ||
    !/^[a-f0-9]{64}$/.test(billingFingerprint)
  ) {
    throw new HttpError(
      400,
      "Stripe-Metadaten sind unvollständig.",
      "invalid_webhook_metadata",
    );
  }
  const admin = getSupabaseAdmin();
  const { data: order, error: lookupError } = await admin
    .from("orders")
    .select(
      "id,user_id,course_id,stripe_price_id,payment_source,billing_snapshot",
    )
    .eq("id", orderId)
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (lookupError)
    throw new HttpError(503, "Die Bestellung konnte nicht geladen werden.");
  if (
    !order ||
    order.user_id !== userId ||
    order.course_id !== courseId ||
    order.stripe_price_id !== priceId ||
    order.payment_source !== "stripe" ||
    order.billing_snapshot?.billingFingerprint !== billingFingerprint
  ) {
    throw new HttpError(
      400,
      "Die Bestellung konnte nicht sicher zugeordnet werden.",
      "order_mismatch",
    );
  }
  const mutableStatuses =
    status === "failed"
      ? ["pending", "processing", "expired"]
      : ["pending", "processing"];
  const { error } = await admin
    .from("orders")
    .update({ payment_status: status })
    .eq("id", order.id)
    .in("payment_status", mutableStatuses);
  if (error)
    throw new HttpError(
      503,
      "Der fehlgeschlagene Zahlungsstatus konnte nicht gespeichert werden.",
    );
}

async function reconcilePaidCheckoutIntentInvoice(
  eventInvoice: Stripe.Invoice,
): Promise<boolean> {
  const intentId = eventInvoice.metadata?.checkout_intent_id;
  if (!intentId) return false;
  if (!uuidPattern.test(intentId)) {
    throw new HttpError(400, "Die Stripe-Rechnungsmetadaten sind ungültig.");
  }
  const stripe = getStripe();
  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(eventInvoice.id);
  } catch {
    throw new HttpError(
      503,
      "Die Rechnung kann gerade nicht bei Stripe geprüft werden.",
    );
  }
  const admin = getSupabaseAdmin();
  const { data: intent, error: intentError } = await admin
    .from("checkout_intents")
    .select(
      "id,provisioned_order_id,course_id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_customer_id,stripe_invoice_id,stripe_price_id,billing_fingerprint,billing_snapshot,amount_total,currency,status",
    )
    .eq("id", intentId)
    .maybeSingle();
  if (
    intentError ||
    !intent ||
    !intent.stripe_checkout_session_id ||
    !intent.stripe_payment_intent_id ||
    !intent.stripe_customer_id ||
    !intent.billing_fingerprint
  ) {
    throw new HttpError(
      503,
      "Der bezahlte Checkout zur Rechnung ist noch nicht verfügbar.",
    );
  }
  let session: Stripe.Checkout.Session;
  let paymentIntent: Stripe.PaymentIntent;
  try {
    [session, paymentIntent] = await Promise.all([
      stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id, {
        expand: ["line_items.data.price"],
      }),
      stripe.paymentIntents.retrieve(intent.stripe_payment_intent_id),
    ]);
  } catch {
    throw new HttpError(
      503,
      "Die Rechnungsevidenz kann gerade nicht geprüft werden.",
    );
  }
  const invoiceCustomerId = expandableId(invoice.customer);
  const sessionCustomerId = expandableId(session.customer);
  const lineItems = session.line_items?.data ?? [];
  const linePriceId =
    lineItems.length === 1 ? expandableId(lineItems[0]?.price) : "";
  if (
    invoice.status !== "paid" ||
    invoice.amount_remaining !== 0 ||
    invoice.amount_paid !== invoice.total ||
    invoiceCustomerId !== intent.stripe_customer_id ||
    sessionCustomerId !== intent.stripe_customer_id ||
    expandableId(session.invoice) !== invoice.id ||
    expandableId(session.payment_intent) !== intent.stripe_payment_intent_id ||
    session.payment_status !== "paid" ||
    session.client_reference_id !== intent.id ||
    session.metadata?.checkout_intent_id !== intent.id ||
    session.metadata?.course_id !== intent.course_id ||
    session.metadata?.price_id !== intent.stripe_price_id ||
    session.metadata?.billing_fingerprint !== intent.billing_fingerprint ||
    linePriceId !== intent.stripe_price_id ||
    lineItems[0]?.quantity !== 1 ||
    paymentIntent.status !== "succeeded" ||
    expandableId(paymentIntent.customer) !== intent.stripe_customer_id ||
    paymentIntent.metadata?.checkout_intent_id !== intent.id ||
    paymentIntent.metadata?.billing_fingerprint !==
      intent.billing_fingerprint ||
    invoice.total !== session.amount_total ||
    paymentIntent.amount !== invoice.total ||
    invoice.currency.toLowerCase() !== (session.currency ?? "").toLowerCase() ||
    paymentIntent.currency.toLowerCase() !== invoice.currency.toLowerCase() ||
    !invoiceMatchesBillingSnapshot(
      invoice,
      intent.billing_snapshot as Record<string, unknown>,
    ) ||
    (intent.amount_total !== null && intent.amount_total !== invoice.total) ||
    (intent.currency !== null &&
      intent.currency.toLowerCase() !== invoice.currency.toLowerCase())
  ) {
    throw new HttpError(
      400,
      "Die bezahlte Rechnung stimmt nicht mit dem Checkout-Intent überein.",
      "checkout_intent_invoice_mismatch",
    );
  }
  if (intent.stripe_invoice_id && intent.stripe_invoice_id !== invoice.id) {
    throw new HttpError(
      400,
      "Für den Checkout ist bereits eine andere Rechnung hinterlegt.",
    );
  }
  const { data: bound, error: bindingError } = await admin.rpc(
    "bind_paid_checkout_intent_invoice",
    {
      target_intent_id: intent.id,
      paid_invoice_id: invoice.id,
    },
  );
  if (bindingError || bound !== true) {
    throw new HttpError(
      503,
      "Die Stripe-Rechnung konnte nicht atomar mit der Bestellung verknüpft werden.",
    );
  }
  return true;
}

/**
 * A post-purchase invoice can be finalized after Checkout's success event. In
 * that case `checkout.session.completed` may not have persisted an invoice ID
 * yet. Reconcile the later `invoice.paid` event against the current Stripe
 * objects and the immutable local checkout evidence before linking it.
 */
async function reconcilePaidInvoice(
  eventInvoice: Stripe.Invoice,
): Promise<boolean> {
  if (eventInvoice.metadata?.checkout_intent_id) {
    return reconcilePaidCheckoutIntentInvoice(eventInvoice);
  }
  const orderId = eventInvoice.metadata?.order_id;
  if (!orderId) return false;

  const stripe = getStripe();
  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(eventInvoice.id);
  } catch {
    throw new HttpError(
      503,
      "Die bezahlte Rechnung kann gerade nicht sicher bei Stripe geprüft werden.",
      "stripe_invoice_lookup_unavailable",
    );
  }

  const metadata = invoice.metadata;
  const userId = metadata?.user_id;
  const courseId = metadata?.course_id;
  const metadataOrderId = metadata?.order_id;
  const priceId = metadata?.price_id;
  const billingFingerprint = metadata?.billing_fingerprint;
  if (
    !userId ||
    !courseId ||
    !metadataOrderId ||
    metadataOrderId !== orderId ||
    !priceId ||
    !billingFingerprint ||
    !/^[a-f0-9]{64}$/.test(billingFingerprint)
  ) {
    throw new HttpError(
      400,
      "Die Stripe-Rechnungsmetadaten sind unvollständig.",
      "invalid_invoice_metadata",
    );
  }

  const admin = getSupabaseAdmin();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id,user_id,course_id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_customer_id,stripe_invoice_id,stripe_price_id,amount_total,currency,payment_source,billing_snapshot",
    )
    .eq("id", metadataOrderId)
    .maybeSingle();
  if (orderError) {
    throw new HttpError(
      503,
      "Die Bestellung zur Rechnung konnte nicht geladen werden.",
    );
  }
  if (
    !order ||
    order.user_id !== userId ||
    order.course_id !== courseId ||
    order.payment_source !== "stripe" ||
    order.stripe_price_id !== priceId ||
    order.billing_snapshot?.billingFingerprint !== billingFingerprint ||
    !order.stripe_checkout_session_id ||
    !order.stripe_customer_id
  ) {
    throw new HttpError(
      400,
      "Die Rechnung kann keiner unveränderten Bestellung zugeordnet werden.",
      "invoice_order_mismatch",
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
      { expand: ["line_items.data.price"] },
    );
  } catch {
    throw new HttpError(
      503,
      "Die Zahlungssitzung zur Rechnung kann gerade nicht sicher geprüft werden.",
      "stripe_session_lookup_unavailable",
    );
  }

  const invoiceCustomerId = expandableId(invoice.customer);
  const sessionCustomerId = expandableId(session.customer);
  const sessionPaymentIntentId = expandableId(session.payment_intent);
  const sessionInvoiceId = expandableId(session.invoice);
  const lineItems = session.line_items?.data ?? [];
  const linePriceId =
    lineItems.length === 1 ? expandableId(lineItems[0]?.price) : "";
  if (
    invoice.status !== "paid" ||
    invoice.amount_remaining !== 0 ||
    invoice.amount_paid !== invoice.total ||
    invoiceCustomerId !== order.stripe_customer_id ||
    sessionCustomerId !== order.stripe_customer_id ||
    sessionInvoiceId !== invoice.id ||
    !sessionPaymentIntentId ||
    (order.stripe_payment_intent_id &&
      order.stripe_payment_intent_id !== sessionPaymentIntentId) ||
    session.payment_status !== "paid" ||
    session.client_reference_id !== userId ||
    session.metadata?.user_id !== userId ||
    session.metadata?.course_id !== courseId ||
    session.metadata?.order_id !== order.id ||
    session.metadata?.price_id !== priceId ||
    session.metadata?.billing_fingerprint !== billingFingerprint ||
    linePriceId !== priceId ||
    lineItems[0]?.quantity !== 1 ||
    invoice.currency.toLowerCase() !== (session.currency ?? "").toLowerCase() ||
    invoice.total !== session.amount_total ||
    (order.amount_total !== null && order.amount_total !== invoice.total) ||
    (order.currency !== null &&
      order.currency.toLowerCase() !== invoice.currency.toLowerCase())
  ) {
    throw new HttpError(
      400,
      "Die bezahlte Rechnung stimmt nicht mit der Checkout-Bestellung überein.",
      "invoice_payment_mismatch",
    );
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(
      sessionPaymentIntentId,
    );
  } catch {
    throw new HttpError(
      503,
      "Die Zahlung zur Rechnung kann gerade nicht sicher geprüft werden.",
      "stripe_payment_lookup_unavailable",
    );
  }
  if (
    paymentIntent.status !== "succeeded" ||
    expandableId(paymentIntent.customer) !== order.stripe_customer_id ||
    paymentIntent.amount !== invoice.total ||
    paymentIntent.currency.toLowerCase() !== invoice.currency.toLowerCase() ||
    paymentIntent.metadata?.user_id !== userId ||
    paymentIntent.metadata?.course_id !== courseId ||
    paymentIntent.metadata?.order_id !== order.id ||
    paymentIntent.metadata?.price_id !== priceId ||
    paymentIntent.metadata?.billing_fingerprint !== billingFingerprint
  ) {
    throw new HttpError(
      400,
      "Die Rechnungszahlung stimmt nicht mit der Bestellung überein.",
      "invoice_payment_intent_mismatch",
    );
  }

  if (order.stripe_invoice_id) {
    if (order.stripe_invoice_id === invoice.id) return true;
    throw new HttpError(
      400,
      "Für diese Bestellung ist bereits eine andere Rechnung hinterlegt.",
      "invoice_conflict",
    );
  }

  const { data: updatedOrder, error: updateError } = await admin
    .from("orders")
    .update({ stripe_invoice_id: invoice.id })
    .eq("id", order.id)
    .is("stripe_invoice_id", null)
    .select("id")
    .maybeSingle();
  if (updateError) {
    throw new HttpError(
      503,
      "Die Rechnungs-ID konnte nicht gespeichert werden.",
    );
  }
  if (updatedOrder) return true;

  // A concurrent delivery may already have linked the same invoice. Treat only
  // that exact state as idempotent; a different invoice remains a hard error.
  const { data: currentOrder, error: currentOrderError } = await admin
    .from("orders")
    .select("stripe_invoice_id")
    .eq("id", order.id)
    .maybeSingle();
  if (currentOrderError || currentOrder?.stripe_invoice_id !== invoice.id) {
    throw new HttpError(
      503,
      "Die Rechnung konnte nicht eindeutig mit der Bestellung verknüpft werden.",
      "invoice_link_conflict",
    );
  }
  return true;
}

async function findOrderByPaymentIntent(paymentIntentId: string) {
  if (!paymentIntentId) {
    throw new HttpError(
      400,
      "Das Zahlungsereignis enthält keine Payment-Intent-ID.",
      "missing_payment_intent",
    );
  }
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select(
      "id,user_id,course_id,stripe_price_id,stripe_payment_intent_id,amount_total,payment_status,payment_source,billing_snapshot",
    )
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error)
    throw new HttpError(
      503,
      "Die Bestellung zur Zahlung konnte nicht geladen werden.",
    );
  return data;
}

async function resolveReversalOrder(paymentIntentId: string) {
  const storedOrder = await findOrderByPaymentIntent(paymentIntentId);
  if (
    storedOrder?.amount_total !== null &&
    storedOrder?.amount_total !== undefined &&
    Boolean(storedOrder?.course_id) &&
    /^[a-f0-9]{64}$/.test(
      storedOrder.billing_snapshot?.billingFingerprint ?? "",
    )
  ) {
    return { order: storedOrder, expectedTotal: storedOrder.amount_total };
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
  } catch {
    throw new HttpError(
      503,
      "Die Zahlung kann gerade nicht sicher bei Stripe nachgeschlagen werden.",
      "stripe_payment_lookup_unavailable",
    );
  }
  const metadataOrderId = paymentIntent.metadata?.order_id;
  const metadataUserId = paymentIntent.metadata?.user_id;
  const metadataCourseId = paymentIntent.metadata?.course_id;
  const metadataPriceId = paymentIntent.metadata?.price_id;
  const metadataBillingFingerprint =
    paymentIntent.metadata?.billing_fingerprint;
  if (
    paymentIntent.id !== paymentIntentId ||
    !metadataOrderId ||
    !metadataUserId ||
    !metadataCourseId ||
    !metadataPriceId ||
    !metadataBillingFingerprint ||
    !/^[a-f0-9]{64}$/.test(metadataBillingFingerprint) ||
    !Number.isSafeInteger(paymentIntent.amount) ||
    paymentIntent.amount < 0
  ) {
    throw new HttpError(
      400,
      "Die Stripe-Zahlungsmetadaten sind unvollständig.",
      "invalid_payment_intent_metadata",
    );
  }

  const admin = getSupabaseAdmin();
  let order = storedOrder;
  if (!order) {
    const { data, error } = await admin
      .from("orders")
      .select(
        "id,user_id,course_id,stripe_price_id,stripe_payment_intent_id,amount_total,payment_status,payment_source,billing_snapshot",
      )
      .eq("id", metadataOrderId)
      .eq("user_id", metadataUserId)
      .maybeSingle();
    if (error) {
      throw new HttpError(
        503,
        "Die Bestellung zur Zahlung konnte nicht geladen werden.",
      );
    }
    order = data;
  }
  if (
    !order ||
    order.id !== metadataOrderId ||
    order.user_id !== metadataUserId ||
    order.course_id !== metadataCourseId ||
    order.payment_source !== "stripe" ||
    order.stripe_price_id !== metadataPriceId ||
    order.billing_snapshot?.billingFingerprint !== metadataBillingFingerprint ||
    (order.stripe_payment_intent_id &&
      order.stripe_payment_intent_id !== paymentIntentId) ||
    (order.amount_total !== null && order.amount_total !== paymentIntent.amount)
  ) {
    throw new HttpError(
      400,
      "Die Zahlung kann keiner unveränderten Bestellung zugeordnet werden.",
      "order_mismatch",
    );
  }
  return { order, expectedTotal: paymentIntent.amount };
}

async function revokeForPaymentIntent(
  paymentIntentId: string,
  kind: "refunded" | "disputed",
  amount?: number,
) {
  const admin = getSupabaseAdmin();
  const { order, expectedTotal } = await resolveReversalOrder(paymentIntentId);
  if (kind === "refunded" && (amount === undefined || amount < expectedTotal))
    return;
  if (
    (kind === "refunded" &&
      ["refunded", "disputed"].includes(order.payment_status)) ||
    (kind === "disputed" && order.payment_status === "disputed")
  ) {
    return;
  }
  const { data: revokedOrderId, error } = await admin.rpc(
    "bind_and_revoke_stripe_order",
    {
      target_order_id: order.id,
      expected_user_id: order.user_id,
      expected_course_id: order.course_id,
      payment_intent_id: paymentIntentId,
      expected_price_id: order.stripe_price_id,
      expected_billing_fingerprint: order.billing_snapshot.billingFingerprint,
      expected_total_amount: expectedTotal,
      new_payment_status: kind,
      new_enrollment_status: kind,
    },
  );
  if (error || revokedOrderId !== order.id)
    throw new HttpError(
      503,
      "Die Zugriffssperre konnte nicht gespeichert werden.",
    );
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_role: "stripe",
    action:
      kind === "refunded"
        ? "access_revoked_after_refund"
        : "access_revoked_after_dispute",
    entity_type: "order",
    entity_id: order.id,
    metadata: {},
  });
  if (auditError)
    throw new HttpError(
      503,
      "Das Zahlungsereignis konnte nicht protokolliert werden.",
    );
  if (kind === "disputed") {
    const adminRecipient =
      [...getAdminEmails()][0] ?? optionalEnv("SUPPORT_EMAIL");
    if (adminRecipient) {
      const sent = await sendTransactionalEmail({
        to: adminRecipient,
        template: "payment_dispute_alert",
        eventKey: `payment-dispute:${order.id}`,
        subject: "Handlungsbedarf: Stripe-Zahlungsanfechtung",
        html: `<p>Stripe hat eine Zahlungsanfechtung für die Bestellung <strong>${order.id}</strong> gemeldet.</p><p>Der Kurszugang wurde automatisch gesperrt. Bitte prüfe den Vorgang zeitnah im Stripe-Dashboard und dokumentiere die weitere Bearbeitung.</p>`,
        text: `Stripe hat eine Zahlungsanfechtung für die Bestellung ${order.id} gemeldet. Der Kurszugang wurde automatisch gesperrt. Bitte prüfe den Vorgang zeitnah im Stripe-Dashboard.`,
      });
      if (!sent)
        throw new HttpError(
          503,
          "Die Admin-Benachrichtigung zur Zahlungsanfechtung wartet auf Wiederholung.",
        );
    }
  }
}

async function revokeForSucceededRefund(refund: Stripe.Refund): Promise<void> {
  if (refund.status !== "succeeded") return;
  const chargeId = expandableId(refund.charge);
  const refundPaymentIntentId = expandableId(refund.payment_intent);
  if (!chargeId || !refundPaymentIntentId) {
    throw new HttpError(
      400,
      "Das Rückerstattungsereignis ist unvollständig.",
      "invalid_refund",
    );
  }

  let charge: Stripe.Charge;
  try {
    charge = await getStripe().charges.retrieve(chargeId);
  } catch {
    throw new HttpError(
      503,
      "Die Rückerstattung kann gerade nicht sicher bei Stripe geprüft werden.",
      "stripe_refund_lookup_unavailable",
    );
  }
  const chargePaymentIntentId = expandableId(charge.payment_intent);
  if (
    charge.id !== chargeId ||
    chargePaymentIntentId !== refundPaymentIntentId ||
    refund.currency.toLowerCase() !== charge.currency.toLowerCase() ||
    refund.amount <= 0 ||
    refund.amount > charge.amount ||
    charge.amount_refunded < refund.amount ||
    charge.amount_refunded > charge.amount
  ) {
    throw new HttpError(
      400,
      "Die Rückerstattung stimmt nicht mit der ursprünglichen Zahlung überein.",
      "refund_payment_mismatch",
    );
  }

  // Use the authoritative cumulative amount from the Charge. Two separate
  // partial refunds must revoke access once their sum reaches the full charge.
  await revokeForPaymentIntent(
    chargePaymentIntentId,
    "refunded",
    charge.amount_refunded,
  );
}

async function processEvent(
  event: Stripe.Event,
): Promise<"processed" | "ignored"> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillCheckoutSession(event.data.object.id);
      return "processed";
    case "checkout.session.async_payment_failed":
      await markCheckoutFailed(event.data.object, "failed");
      return "processed";
    case "checkout.session.expired":
      await markCheckoutFailed(event.data.object, "expired");
      return "processed";
    case "invoice.paid": {
      return (await reconcilePaidInvoice(event.data.object))
        ? "processed"
        : "ignored";
    }
    case "charge.refunded": {
      const charge = event.data.object;
      if (charge.refunded) {
        await revokeForPaymentIntent(
          expandableId(charge.payment_intent),
          "refunded",
          charge.amount_refunded,
        );
      }
      return "processed";
    }
    case "refund.created":
    case "refund.updated": {
      await revokeForSucceededRefund(event.data.object);
      return "processed";
    }
    case "charge.dispute.created": {
      const dispute = event.data.object;
      await revokeForPaymentIntent(
        expandableId(dispute.payment_intent),
        "disputed",
      );
      return "processed";
    }
    default:
      return "ignored";
  }
}

export async function processStripeWebhook(
  rawBody: string,
  signature: string,
): Promise<void> {
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    throw new HttpError(
      400,
      "Die Webhook-Signatur ist ungültig.",
      "invalid_signature",
    );
  }
  const admin = getSupabaseAdmin();
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const { error: insertError } = await admin.from("webhook_events").insert({
    provider: "stripe",
    external_event_id: event.id,
    event_type: event.type,
    status: "processing",
    payload_hash: payloadHash,
  });
  if (insertError) {
    if (insertError.code !== "23505") {
      throw new HttpError(
        503,
        "Das Webhook-Ereignis konnte nicht beansprucht werden.",
      );
    }
    const { data: existing, error: existingError } = await admin
      .from("webhook_events")
      .select("id,status,payload_hash,received_at")
      .eq("provider", "stripe")
      .eq("external_event_id", event.id)
      .maybeSingle();
    if (existingError)
      throw new HttpError(
        503,
        "Das Webhook-Ereignis konnte nicht geladen werden.",
      );
    if (!existing || existing.payload_hash !== payloadHash) {
      throw new HttpError(
        400,
        "Das Webhook-Ereignis ist inkonsistent.",
        "webhook_conflict",
      );
    }
    if (["processed", "ignored"].includes(existing.status)) return;
    if (existing.status === "processing") {
      const stale =
        Date.now() - new Date(existing.received_at).getTime() > 10 * 60 * 1000;
      if (!stale) {
        throw new HttpError(
          503,
          "Das Webhook-Ereignis wird bereits verarbeitet.",
          "webhook_in_progress",
        );
      }
    }
    const { data: reclaimedEvent, error: reclaimError } = await admin
      .from("webhook_events")
      .update({
        status: "processing",
        received_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .eq("received_at", existing.received_at)
      .select("id")
      .maybeSingle();
    if (reclaimError)
      throw new HttpError(
        503,
        "Das Webhook-Ereignis konnte nicht erneut beansprucht werden.",
      );
    if (!reclaimedEvent) {
      throw new HttpError(
        503,
        "Das Webhook-Ereignis wurde bereits erneut beansprucht.",
        "webhook_in_progress",
      );
    }
  }

  try {
    const result = await processEvent(event);
    const { error: completionError } = await admin
      .from("webhook_events")
      .update({
        status: result,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("provider", "stripe")
      .eq("external_event_id", event.id);
    if (completionError)
      throw new HttpError(
        503,
        "Der Webhook-Abschluss konnte nicht gespeichert werden.",
      );
  } catch (error) {
    const { error: failurePersistError } = await admin
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: "Verarbeitung fehlgeschlagen; erneuter Versuch möglich.",
      })
      .eq("provider", "stripe")
      .eq("external_event_id", event.id);
    if (failurePersistError) {
      throw new HttpError(
        503,
        "Der Webhook-Fehlerstatus konnte nicht gespeichert werden.",
      );
    }
    throw error;
  }
}
