import "server-only";

import { createHash } from "node:crypto";

import type Stripe from "stripe";

import { getAdminEmails, optionalEnv, requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { sendEnrollmentActivatedEmail, sendTransactionalEmail } from "./email";
import { HttpError } from "./http";
import { getStripe } from "./stripe";

const expandableId = (
  value: { id: string } | string | null | undefined,
): string => (typeof value === "string" ? value : (value?.id ?? ""));

async function fulfillCheckoutSession(sessionId: string): Promise<void> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price", "invoice", "payment_intent", "customer"],
  });
  if (session.payment_status !== "paid") return;
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
      const invoice = event.data.object;
      const orderId = invoice.metadata?.order_id;
      if (orderId) {
        const { data: updatedOrder, error } = await getSupabaseAdmin()
          .from("orders")
          .update({ stripe_invoice_id: invoice.id })
          .eq("id", orderId)
          .select("id")
          .maybeSingle();
        if (error)
          throw new HttpError(
            503,
            "Die Rechnungs-ID konnte nicht gespeichert werden.",
          );
        if (!updatedOrder)
          throw new HttpError(
            503,
            "Die Rechnung konnte keiner Bestellung zugeordnet werden.",
          );
      }
      return "processed";
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
      const refund = event.data.object;
      if (refund.status === "succeeded") {
        await revokeForPaymentIntent(
          expandableId(refund.payment_intent),
          "refunded",
          refund.amount,
        );
      }
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
