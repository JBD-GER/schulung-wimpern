import {
  clearCheckoutIntentCookie,
  requireCheckoutIntent,
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

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const intent = await requireCheckoutIntent({ includeExpired: true });
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
    let paymentOutcome: "cancelled" | "expired" = "cancelled";
    if (intent.stripe_checkout_session_id) {
      let session;
      try {
        session = await getStripe().checkout.sessions.retrieve(
          intent.stripe_checkout_session_id,
        );
      } catch {
        throw new HttpError(
          502,
          "Der Zahlungsstatus konnte gerade nicht sicher geprüft werden.",
        );
      }
      if (session.status === "complete") {
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
          session = await getStripe().checkout.sessions.expire(session.id);
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
    const admin = getSupabaseAdmin();
    const { data: cancelled, error } = await admin
      .from("checkout_intents")
      .update({ status: "expired" })
      .eq("id", intent.id)
      .is("paid_at", null)
      .in("status", ["draft", "ready", "email_verified", "open", "processing"])
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
        await getStripe().customers.del(intent.stripe_customer_id);
      } catch {
        throw new HttpError(
          502,
          "Die vorläufigen Stripe-Kundendaten konnten noch nicht gelöscht werden. Bitte versuche den Abbruch erneut.",
        );
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
        throw new HttpError(
          503,
          "Die Löschung der vorläufigen Stripe-Kundendaten konnte nicht bestätigt werden.",
        );
      }
    }
    await clearCheckoutIntentCookie();
    return Response.json(
      { ok: true, redirectUrl: `/checkout?payment=${paymentOutcome}` },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
