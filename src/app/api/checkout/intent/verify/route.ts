import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { observeAuthSession } from "@/lib/server/auth-sessions";
import {
  hashCheckoutIntentToken,
  requireCheckoutIntent,
  resolveAuthUserByEmail,
} from "@/lib/server/checkout-intent";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function checkoutRedirect(status: "verified" | "failed") {
  const url = new URL("/checkout", getSiteUrl());
  url.searchParams.set("verification", status);
  return NextResponse.redirect(url, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token))
      return checkoutRedirect("failed");
    const intent = await requireCheckoutIntent();
    await enforceRateLimit({
      bucket: "checkout-intent-verify",
      subject: `${requestSubject(request)}:${intent.id}`,
      maximum: 8,
      windowSeconds: 1800,
    });
    const tokenHash = hashCheckoutIntentToken(token);
    if (
      !intent.email_verification_token_hash ||
      intent.email_verification_token_hash !== tokenHash
    ) {
      return checkoutRedirect("failed");
    }

    const admin = getSupabaseAdmin();
    const existingUserId = await resolveAuthUserByEmail(intent.email);
    if (existingUserId) {
      const { data: generated, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: intent.email,
        });
      if (
        linkError ||
        !generated.user ||
        generated.user.id !== existingUserId ||
        !generated.properties?.hashed_token
      ) {
        return checkoutRedirect("failed");
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
        verified.user.id !== existingUserId ||
        !verified.session
      ) {
        return checkoutRedirect("failed");
      }
      await observeAuthSession(request, existingUserId, verified.session);
    }

    const { data: updated, error: updateError } = await admin
      .from("checkout_intents")
      .update({
        auth_user_id: existingUserId,
        email_verified_at: new Date().toISOString(),
        email_verification_token_hash: null,
        status: "email_verified",
      })
      .eq("id", intent.id)
      .eq("browser_token_hash", intent.browser_token_hash)
      .eq("email_verification_token_hash", tokenHash)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (updateError || !updated) return checkoutRedirect("failed");
    return checkoutRedirect("verified");
  } catch {
    return checkoutRedirect("failed");
  }
}
