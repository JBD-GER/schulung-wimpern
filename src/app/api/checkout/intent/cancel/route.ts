import { randomUUID } from "node:crypto";

import {
  clearCheckoutIntentCookie,
  requireCheckoutIntent,
  type CheckoutIntentRow,
} from "@/lib/server/checkout-intent";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getStripe } from "@/lib/server/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

function isStripeResourceMissing(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "resource_missing",
  );
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
    let intent = await requireCheckoutIntent({ includeExpired: true });
    await enforceRateLimit({
      bucket: "checkout-intent-cancel",
      subject: intent.id,
      maximum: 8,
      windowSeconds: 1800,
    });
    if (
      intent.paid_at ||
      ["paid", "provisioning", "provisioned"].includes(intent.status)
    ) {
      throw new HttpError(
        409,
        "Die Zahlung wurde bereits bestätigt und kann hier nicht abgebrochen werden.",
        "payment_already_confirmed",
      );
    }

    const admin = getSupabaseAdmin();
    if (
      ["ready", "email_verified"].includes(intent.status) &&
      !intent.stripe_checkout_session_id
    ) {
      const { data: directlyCancelled, error: directCancelError } = await admin
        .from("checkout_intents")
        .update({ status: "expired" })
        .eq("id", intent.id)
        .eq("status", intent.status)
        .is("paid_at", null)
        .is("stripe_checkout_session_id", null)
        .select("id")
        .maybeSingle();
      if (directCancelError) {
        throw new HttpError(
          503,
          "Der Checkout-Abbruch konnte nicht gespeichert werden.",
          "checkout_cancel_unavailable",
        );
      }
      if (directlyCancelled) {
        intent = { ...intent, status: "expired" };
      } else {
        // Session preparation may have won the compare-and-set race. Reload
        // and take the same lease as that worker before touching Stripe.
        intent = await requireCheckoutIntent({ includeExpired: true });
      }
    }
    if (
      ["ready", "email_verified", "open", "processing"].includes(intent.status)
    ) {
      const leaseToken = randomUUID();
      const { data: acquired, error: leaseError } = await admin.rpc(
        "acquire_checkout_intent_preparation",
        {
          target_intent_id: intent.id,
          expected_browser_token_hash: intent.browser_token_hash,
          requested_lease_token: leaseToken,
          lease_ttl_seconds: 90,
        },
      );
      if (leaseError) {
        throw new HttpError(
          503,
          "Der Checkout-Abbruch kann gerade nicht in der Datenbank reserviert werden.",
          "checkout_cancel_unavailable",
        );
      }
      if (acquired !== true) {
        const { data: current, error: currentError } = await admin
          .from("checkout_intents")
          .select("status,paid_at,preparation_lease_expires_at")
          .eq("id", intent.id)
          .maybeSingle();
        if (currentError || !current) {
          throw new HttpError(
            503,
            "Der Checkout-Abbruch kann gerade nicht sicher geprüft werden.",
            "checkout_cancel_unavailable",
          );
        }
        if (
          current.paid_at ||
          ["paid", "provisioning", "provisioned"].includes(current.status)
        ) {
          throw new HttpError(
            409,
            "Die Zahlung wurde inzwischen bestätigt und kann hier nicht mehr abgebrochen werden.",
            "payment_already_confirmed",
          );
        }
        if (["failed", "expired"].includes(current.status)) {
          intent = { ...intent, status: current.status };
        } else {
          throw new HttpError(
            409,
            "Der Checkout wird gerade vorbereitet. Bitte versuche den Abbruch gleich erneut.",
            "checkout_in_progress",
          );
        }
      } else {
        lease = { intentId: intent.id, token: leaseToken, admin };
        const { data: leasedIntent, error: leasedIntentError } = await admin
          .from("checkout_intents")
          .select("*")
          .eq("id", intent.id)
          .eq("preparation_lease_token", leaseToken)
          .eq("status", "processing")
          .single();
        if (leasedIntentError || !leasedIntent) {
          throw new HttpError(
            503,
            "Der aktuelle Checkout-Zustand konnte nicht für den Abbruch gebunden werden.",
            "checkout_cancel_unavailable",
          );
        }
        intent = leasedIntent as CheckoutIntentRow;
      }
    }

    let paymentOutcome: "cancelled" | "expired" = "cancelled";
    const stripe = getStripe();
    if (intent.stripe_checkout_session_id) {
      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(
          intent.stripe_checkout_session_id,
        );
      } catch {
        throw new HttpError(
          502,
          "Der Zahlungsstatus konnte gerade nicht sicher geprüft werden.",
        );
      }
      if (session.status === "complete" || session.payment_status === "paid") {
        throw new HttpError(
          409,
          "Die Zahlung wird bereits verarbeitet. Bitte starte keine zweite Zahlung.",
          "payment_processing",
        );
      }
      if (
        session.status === "expired" ||
        session.expires_at * 1000 <= Date.now()
      ) {
        paymentOutcome = "expired";
      }
      if (session.status === "open") {
        try {
          session = await stripe.checkout.sessions.expire(session.id);
        } catch {
          throw new HttpError(
            502,
            "Die Zahlungssitzung konnte noch nicht sicher beendet werden.",
          );
        }
      }
      if (session.status !== "expired") {
        throw new HttpError(
          409,
          "Die Zahlungssitzung ist noch nicht beendet.",
          "payment_processing",
        );
      }
    }

    let cancellationQuery = admin
      .from("checkout_intents")
      .update({ status: "expired" })
      .eq("id", intent.id)
      .is("paid_at", null);
    cancellationQuery = lease
      ? cancellationQuery
          .eq("preparation_lease_token", lease.token)
          .eq("status", "processing")
      : cancellationQuery.in("status", [
          "draft",
          "ready",
          "email_verified",
          "open",
          "processing",
          "failed",
          "expired",
        ]);
    const { data: cancelled, error } = await cancellationQuery
      .select("id")
      .maybeSingle();
    if (error) {
      throw new HttpError(
        503,
        "Der Checkout-Abbruch konnte nicht gespeichert werden.",
      );
    }
    if (!cancelled) {
      const { data: current, error: currentError } = await admin
        .from("checkout_intents")
        .select("status,paid_at")
        .eq("id", intent.id)
        .maybeSingle();
      if (currentError || !current) {
        throw new HttpError(
          503,
          "Der Checkout-Abbruch konnte nicht bestätigt werden.",
        );
      }
      if (
        current.paid_at ||
        ["paid", "provisioning", "provisioned"].includes(current.status)
      ) {
        throw new HttpError(
          409,
          "Die Zahlung wurde inzwischen bestätigt und kann hier nicht mehr abgebrochen werden.",
          "payment_already_confirmed",
        );
      }
      if (current.status !== "expired") {
        throw new HttpError(
          409,
          "Der Checkout wird noch verarbeitet und konnte nicht sicher abgebrochen werden.",
          "payment_processing",
        );
      }
    }

    if (!intent.auth_user_id && intent.stripe_customer_id) {
      try {
        await stripe.customers.del(intent.stripe_customer_id);
      } catch (error) {
        if (!isStripeResourceMissing(error)) {
          throw new HttpError(
            502,
            "Die vorläufigen Stripe-Kundendaten konnten noch nicht gelöscht werden. Bitte versuche den Abbruch erneut.",
          );
        }
      }
      const { data: unlinked, error: unlinkError } = await admin
        .from("checkout_intents")
        .update({ stripe_customer_id: null })
        .eq("id", intent.id)
        .eq("status", "expired")
        .is("paid_at", null)
        .select("id")
        .maybeSingle();
      if (unlinkError || !unlinked) {
        const { data: current, error: currentError } = await admin
          .from("checkout_intents")
          .select("stripe_customer_id,status,paid_at")
          .eq("id", intent.id)
          .maybeSingle();
        if (
          currentError ||
          !current ||
          current.stripe_customer_id !== null ||
          current.status !== "expired" ||
          current.paid_at !== null
        ) {
          throw new HttpError(
            503,
            "Die Löschung der vorläufigen Stripe-Kundendaten konnte nicht bestätigt werden.",
          );
        }
      }
    }
    await clearCheckoutIntentCookie();
    return Response.json(
      { ok: true, redirectUrl: `/checkout?payment=${paymentOutcome}` },
      { headers: noStoreHeaders() },
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
