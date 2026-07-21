import { timingSafeEqual } from "node:crypto";

import { requireEnv } from "@/lib/env";
import {
  contractConfirmationForIntent,
  provisionPaidCheckoutIntent,
  type CheckoutIntentRow,
} from "@/lib/server/checkout-intent";
import {
  sendEnrollmentActivatedEmail,
  sendWithdrawalReceivedEmail,
} from "@/lib/server/email";
import { noStoreHeaders } from "@/lib/server/http";
import { getStripe } from "@/lib/server/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = `Bearer ${requireEnv("CRON_SECRET")}`;
  const received = request.headers.get("authorization") ?? "";
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function stripeId(value: null | string | { id: string }): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

export async function GET(request: Request) {
  try {
    if (!authorized(request)) {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: noStoreHeaders() },
      );
    }

    const admin = getSupabaseAdmin();
    const staleProvisioningCutoff = new Date().toISOString();
    const { data: paidIntents, error: paidIntentError } = await admin
      .from("checkout_intents")
      .select("id")
      .not("paid_at", "is", null)
      .or(
        `status.eq.paid,and(status.eq.provisioning,provisioning_lease_expires_at.lt.${staleProvisioningCutoff})`,
      )
      .order("paid_at", { ascending: true })
      .limit(10);
    if (paidIntentError) throw paidIntentError;
    let recoveredPaidIntents = 0;
    let pendingPaidIntents = 0;
    for (const intent of paidIntents ?? []) {
      try {
        await provisionPaidCheckoutIntent(intent.id);
        recoveredPaidIntents += 1;
      } catch {
        // The lease-protected operation is safe to retry. Keep the failed
        // count visible in the cron response for operational alerting.
        pendingPaidIntents += 1;
      }
    }
    const abandonedCutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: retentionIntents, error: retentionError } = await admin
      .from("checkout_intents")
      .select(
        "id,auth_user_id,stripe_customer_id,stripe_checkout_session_id,stripe_payment_intent_id",
      )
      .is("paid_at", null)
      .or(
        "stripe_customer_id.not.is.null,stripe_checkout_session_id.not.is.null",
      )
      .lt("expires_at", abandonedCutoff)
      .in("status", [
        "draft",
        "email_verified",
        "open",
        "processing",
        "failed",
        "expired",
      ])
      .limit(20);
    if (retentionError) throw retentionError;
    let deletedStripeCustomers = 0;
    let pendingStripeCustomers = 0;
    let reconciledUnpaidIntents = 0;
    const stripe = getStripe();
    for (const intent of retentionIntents ?? []) {
      try {
        if (intent.stripe_checkout_session_id) {
          const session = await stripe.checkout.sessions.retrieve(
            intent.stripe_checkout_session_id,
            { expand: ["payment_intent"] },
          );
          const remoteCustomerId = stripeId(session.customer);
          if (
            session.id !== intent.stripe_checkout_session_id ||
            session.client_reference_id !== intent.id ||
            session.metadata?.checkout_intent_id !== intent.id ||
            session.status !== "expired" ||
            session.payment_status !== "unpaid" ||
            !intent.stripe_customer_id ||
            remoteCustomerId !== intent.stripe_customer_id
          ) {
            pendingStripeCustomers += 1;
            continue;
          }
          let paymentIntent = session.payment_intent;
          if (typeof paymentIntent === "string") {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
          }
          if (
            paymentIntent &&
            !["canceled", "requires_payment_method"].includes(
              paymentIntent.status,
            )
          ) {
            pendingStripeCustomers += 1;
            continue;
          }
        } else if (intent.stripe_payment_intent_id) {
          pendingStripeCustomers += 1;
          continue;
        }

        const deleteEphemeralCustomer =
          !intent.auth_user_id && Boolean(intent.stripe_customer_id);
        if (deleteEphemeralCustomer) {
          try {
            await stripe.customers.del(intent.stripe_customer_id!);
          } catch (error) {
            if (
              !error ||
              typeof error !== "object" ||
              !("code" in error) ||
              error.code !== "resource_missing"
            ) {
              pendingStripeCustomers += 1;
              continue;
            }
          }
          deletedStripeCustomers += 1;
        }

        let unlinkQuery = admin
          .from("checkout_intents")
          .update({
            stripe_checkout_session_id: null,
            stripe_payment_intent_id: null,
            ...(deleteEphemeralCustomer ? { stripe_customer_id: null } : {}),
          })
          .eq("id", intent.id)
          .is("paid_at", null);
        if (intent.stripe_checkout_session_id) {
          unlinkQuery = unlinkQuery.eq(
            "stripe_checkout_session_id",
            intent.stripe_checkout_session_id,
          );
        } else {
          unlinkQuery = unlinkQuery.is("stripe_checkout_session_id", null);
        }
        const { data: unlinked, error: unlinkError } = await unlinkQuery
          .select("id")
          .maybeSingle();
        if (unlinkError || !unlinked) {
          pendingStripeCustomers += 1;
          continue;
        }
        reconciledUnpaidIntents += 1;
      } catch {
        pendingStripeCustomers += 1;
      }
    }
    const { data: purgedIntents, error: purgeError } = await admin.rpc(
      "purge_expired_unpaid_checkout_intents",
    );
    if (purgeError) throw purgeError;
    const staleSendingCutoff = new Date(
      Date.now() - 10 * 60 * 1000,
    ).toISOString();
    const { data: deliveries, error } = await admin
      .from("email_deliveries")
      .select("event_key,template,recipient_email")
      .in("template", [
        "electronic_withdrawal_received",
        "enrollment_activated",
      ])
      .or(
        `status.eq.failed,and(status.eq.sending,updated_at.lt.${staleSendingCutoff})`,
      )
      .order("updated_at", { ascending: true })
      .limit(20);
    if (error) throw error;

    let sent = 0;
    let pending = 0;
    for (const delivery of deliveries ?? []) {
      try {
        if (delivery.template === "electronic_withdrawal_received") {
          const withdrawalId = delivery.event_key.replace(
            "electronic-withdrawal-received:",
            "",
          );
          if (!/^[0-9a-f-]{36}$/i.test(withdrawalId)) throw new Error();
          const { data: withdrawal, error: withdrawalError } = await admin
            .from("withdrawal_requests")
            .select(
              "id,receipt_number,consumer_name,contract_reference,confirmation_email,declaration_text,received_at",
            )
            .eq("id", withdrawalId)
            .maybeSingle();
          if (withdrawalError || !withdrawal) throw new Error();
          const delivered = await sendWithdrawalReceivedEmail({
            withdrawalId: withdrawal.id,
            receiptNumber: withdrawal.receipt_number,
            consumerName: withdrawal.consumer_name,
            contractReference: withdrawal.contract_reference,
            confirmationEmail: withdrawal.confirmation_email,
            declarationText: withdrawal.declaration_text,
            receivedAt: withdrawal.received_at,
          });
          if (!delivered) throw new Error();
          sent += 1;
          continue;
        }

        const orderId = delivery.event_key.replace("enrollment-activated:", "");
        if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error();
        const [orderResult, intentResult] = await Promise.all([
          admin
            .from("orders")
            .select("id,user_id,course_id,payment_status")
            .eq("id", orderId)
            .eq("payment_status", "paid")
            .maybeSingle(),
          admin
            .from("checkout_intents")
            .select("*")
            .eq("provisioned_order_id", orderId)
            .eq("status", "provisioned")
            .maybeSingle(),
        ]);
        const order = orderResult.data;
        const intent = intentResult.data as CheckoutIntentRow | null;
        if (orderResult.error || intentResult.error || !order || !intent)
          throw new Error();
        const { data: enrollment, error: enrollmentError } = await admin
          .from("enrollments")
          .select("id")
          .eq("user_id", order.user_id)
          .eq("course_id", order.course_id)
          .in("status", ["active", "completed"])
          .maybeSingle();
        if (
          enrollmentError ||
          !enrollment ||
          intent.auth_user_id !== order.user_id ||
          intent.course_id !== order.course_id ||
          intent.provisioned_order_id !== order.id ||
          intent.email !== delivery.recipient_email
        ) {
          throw new Error();
        }
        const delivered = await sendEnrollmentActivatedEmail({
          userId: order.user_id,
          orderId: order.id,
          firstName: intent.first_name,
          email: intent.email,
          passwordCreatedDuringCheckout: false,
          contractConfirmation: contractConfirmationForIntent(intent),
        });
        if (!delivered) throw new Error();
        sent += 1;
      } catch {
        pending += 1;
      }
    }

    const hasOperationalFailures =
      pendingPaidIntents > 0 || pendingStripeCustomers > 0 || pending > 0;
    return Response.json(
      {
        ok: !hasOperationalFailures,
        checkedPaidIntents: paidIntents?.length ?? 0,
        recoveredPaidIntents,
        pendingPaidIntents,
        purgedCheckoutIntents:
          typeof purgedIntents === "number" ? purgedIntents : 0,
        deletedStripeCustomers,
        reconciledUnpaidIntents,
        pendingStripeCustomers,
        checked: deliveries?.length ?? 0,
        sent,
        pending,
      },
      {
        status: hasOperationalFailures ? 503 : 200,
        headers: noStoreHeaders(),
      },
    );
  } catch {
    return Response.json(
      { ok: false, error: "email_retry_failed" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
