import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getCurrentUser } from "@/lib/server/auth";
import { observeAuthSession } from "@/lib/server/auth-sessions";
import {
  clearCheckoutIntentCookie,
  requireCheckoutIntent,
} from "@/lib/server/checkout-intent";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { COURSE } from "@/data/course";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .regex(/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/)
    .max(255),
});

async function orderConfirmation(orderId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("amount_total,currency,tax_amount,billing_snapshot")
    .eq("id", orderId)
    .eq("payment_status", "paid")
    .single();
  if (error || !data || data.amount_total === null || !data.currency) {
    throw new HttpError(
      503,
      "Die bezahlte Bestellung kann noch nicht geladen werden.",
    );
  }
  const snapshot =
    typeof data.billing_snapshot === "object" && data.billing_snapshot !== null
      ? (data.billing_snapshot as Record<string, unknown>)
      : {};
  return {
    productName:
      typeof snapshot.productName === "string" && snapshot.productName.trim()
        ? snapshot.productName
        : COURSE.productName,
    amountTotal: data.amount_total,
    currency: data.currency,
    taxAmount: data.tax_amount,
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = inputSchema.parse(await readJson(request));
    const intent = await requireCheckoutIntent({ includeExpired: true });
    await enforceRateLimit({
      bucket: "checkout-intent-complete",
      subject: intent.id,
      maximum: 80,
      windowSeconds: 600,
    });
    if (intent.stripe_checkout_session_id !== input.sessionId) {
      throw new HttpError(
        404,
        "Die Zahlungsbestätigung gehört nicht zu diesem Checkout.",
        "checkout_session_not_found",
      );
    }
    if (["failed", "expired"].includes(intent.status)) {
      await clearCheckoutIntentCookie();
      return Response.json(
        {
          status: "failed",
          redirectUrl: `/checkout?payment=${intent.status}`,
          message:
            "Die Zahlung wurde nicht erfolgreich bestätigt. Es wurde kein Teilnehmerkonto und kein Kurszugang angelegt.",
        },
        { headers: noStoreHeaders() },
      );
    }
    if (
      intent.status !== "provisioned" ||
      !intent.auth_user_id ||
      !intent.provisioned_order_id
    ) {
      return Response.json(
        {
          status: "pending",
          message:
            intent.status === "paid" || intent.status === "provisioning"
              ? "Die Zahlung ist bestätigt. Dein Teilnehmerkonto wird jetzt sicher freigeschaltet."
              : "Deine Zahlung wird gerade von Stripe bestätigt.",
        },
        { headers: noStoreHeaders() },
      );
    }

    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.id !== intent.auth_user_id) {
      throw new HttpError(
        409,
        "In diesem Browser ist ein anderes Konto angemeldet. Bitte melde es zuerst ab.",
        "checkout_account_conflict",
      );
    }
    if (new Date(intent.expires_at).getTime() <= Date.now()) {
      await clearCheckoutIntentCookie();
      if (currentUser?.id === intent.auth_user_id) {
        const order = await orderConfirmation(intent.provisioned_order_id);
        return Response.json(
          {
            status: "active",
            redirectUrl: "/dashboard",
            message:
              "Deine Zahlung ist bestätigt und dein Schulungszugang ist aktiv.",
            order,
          },
          { headers: noStoreHeaders() },
        );
      }
      throw new HttpError(
        401,
        "Die einmalige automatische Anmeldung ist abgelaufen. Dein bezahlter Zugang bleibt erhalten; nutze bitte den sicheren Login oder „Passwort vergessen“.",
        "checkout_bootstrap_expired",
      );
    }
    const admin = getSupabaseAdmin();
    if (!currentUser) {
      if (intent.bootstrap_consumed_at) {
        throw new HttpError(
          401,
          "Die automatische Anmeldung wurde bereits verwendet. Nutze bitte den sicheren Login oder „Passwort vergessen“.",
          "checkout_bootstrap_consumed",
        );
      }
      const leaseToken = randomUUID();
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_checkout_intent_bootstrap",
        {
          target_intent_id: intent.id,
          expected_browser_token_hash: intent.browser_token_hash,
          requested_lease_token: leaseToken,
          lease_ttl_seconds: 60,
        },
      );
      if (claimError || claimed !== true) {
        throw new HttpError(
          409,
          "Die automatische Anmeldung wird bereits verarbeitet.",
          "checkout_bootstrap_in_progress",
        );
      }
      try {
        const { data: generated, error: linkError } =
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email: intent.email,
          });
        if (
          linkError ||
          !generated.user ||
          generated.user.id !== intent.auth_user_id ||
          !generated.properties?.hashed_token
        ) {
          throw new Error("Supabase bootstrap link mismatch.");
        }
        const supabase = await createClient();
        const { data: verified, error: verificationError } =
          await supabase.auth.verifyOtp({
            token_hash: generated.properties.hashed_token,
            type: "magiclink",
          });
        if (
          verificationError ||
          !verified.user ||
          verified.user.id !== intent.auth_user_id ||
          !verified.session
        ) {
          throw new Error("Supabase bootstrap session mismatch.");
        }
        const observedSessionId = await observeAuthSession(
          request,
          intent.auth_user_id,
          verified.session,
        );
        if (!observedSessionId) {
          throw new Error("Supabase bootstrap session has no stable ID.");
        }
      } catch {
        await admin.rpc("release_checkout_intent_bootstrap", {
          target_intent_id: intent.id,
          requested_lease_token: leaseToken,
        });
        throw new HttpError(
          503,
          "Die automatische Anmeldung konnte noch nicht abgeschlossen werden. Bitte versuche es gleich erneut.",
          "checkout_bootstrap_failed",
        );
      }
      return Response.json(
        {
          status: "pending",
          message:
            "Deine sichere Teilnehmer-Sitzung wurde vorbereitet und wird jetzt abschließend bestätigt.",
        },
        { headers: noStoreHeaders() },
      );
    }
    const { data: consumed, error: consumeError } = await admin.rpc(
      "consume_checkout_intent_bootstrap",
      {
        target_intent_id: intent.id,
        expected_browser_token_hash: intent.browser_token_hash,
        authenticated_user_id: currentUser.id,
      },
    );
    if (consumeError || consumed !== true) {
      throw new HttpError(
        503,
        "Die Teilnehmer-Sitzung konnte nicht abschließend bestätigt werden.",
      );
    }
    const order = await orderConfirmation(intent.provisioned_order_id);
    await clearCheckoutIntentCookie();
    return Response.json(
      {
        status: "active",
        redirectUrl: "/dashboard",
        message:
          "Deine Zahlung ist bestätigt. Dein Konto und dein Schulungszugang sind aktiviert.",
        order,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
