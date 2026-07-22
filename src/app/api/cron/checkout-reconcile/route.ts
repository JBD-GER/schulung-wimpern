import { timingSafeEqual } from "node:crypto";

import { requireEnv } from "@/lib/env";
import { noStoreHeaders } from "@/lib/server/http";
import { reconcileStripeCheckoutSession } from "@/lib/server/stripe-webhook";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = Buffer.from(`Bearer ${requireEnv("CRON_SECRET")}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  try {
    const admin = getSupabaseAdmin();
    const now = new Date();
    const minimumAge = new Date(now.getTime() - 60_000).toISOString();
    const retryCutoff = new Date(now.getTime() - 5 * 60_000).toISOString();
    const { data: candidates, error } = await admin
      .from("checkout_intents")
      .select("id,stripe_checkout_session_id,status")
      .is("paid_at", null)
      .not("stripe_checkout_session_id", "is", null)
      .in("status", ["open", "processing"])
      .lt("updated_at", minimumAge)
      .or(
        `payment_reconciliation_checked_at.is.null,payment_reconciliation_checked_at.lt.${retryCutoff}`,
      )
      .order("payment_reconciliation_checked_at", {
        ascending: true,
        nullsFirst: true,
      })
      .order("updated_at", { ascending: true })
      .limit(5);
    if (error) throw error;

    let paid = 0;
    let pending = 0;
    let failed = 0;
    for (const candidate of candidates ?? []) {
      const sessionId = candidate.stripe_checkout_session_id;
      if (!sessionId) continue;
      try {
        const result = await reconcileStripeCheckoutSession(sessionId);
        if (result === "paid") paid += 1;
        else pending += 1;
      } catch {
        failed += 1;
      } finally {
        // A compare-and-set keeps a later paid/provisioned transition intact.
        // A transient timestamp-write failure merely causes an earlier retry.
        await admin
          .from("checkout_intents")
          .update({
            payment_reconciliation_checked_at: new Date().toISOString(),
          })
          .eq("id", candidate.id)
          .eq("stripe_checkout_session_id", sessionId)
          .is("paid_at", null)
          .in("status", ["open", "processing"]);
      }
    }

    return Response.json(
      {
        ok: failed === 0,
        checked: candidates?.length ?? 0,
        paid,
        pending,
        failed,
      },
      {
        status: failed === 0 ? 200 : 503,
        headers: noStoreHeaders(),
      },
    );
  } catch {
    return Response.json(
      { ok: false, error: "checkout_reconciliation_failed" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
