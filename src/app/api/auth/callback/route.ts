import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { observeAuthSession } from "@/lib/server/auth-sessions";
import { createRecoveryProof, RECOVERY_COOKIE } from "@/lib/server/recovery";
import { createClient } from "@/lib/supabase/server";

const allowedDestinations = new Set([
  "/checkout",
  "/passwort-zuruecksetzen",
  "/dashboard",
  "/profil",
  "/login",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedNext = url.searchParams.get("next") ?? "/checkout";
  const next = allowedDestinations.has(requestedNext)
    ? requestedNext
    : "/checkout";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const flow = url.searchParams.get("flow");
  const supabase = await createClient();
  let succeeded = false;
  let authenticatedUser: Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"] = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    succeeded = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    succeeded = !error;
  }
  if (succeeded) {
    const [userResult, sessionResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);
    if (
      userResult.error ||
      sessionResult.error ||
      !userResult.data.user ||
      !sessionResult.data.session
    ) {
      succeeded = false;
    } else {
      authenticatedUser = userResult.data.user;
      try {
        await observeAuthSession(
          request,
          authenticatedUser.id,
          sessionResult.data.session,
        );
      } catch {
        // Supabase remains the authority for the session. A later authenticated
        // request retries the local device overview without consuming this link again.
      }
    }
  }

  const passwordSetupFlow =
    type === "recovery" || type === "invite" || flow === "invite";
  const successfulDestination = passwordSetupFlow
    ? "/passwort-zuruecksetzen"
    : next;
  const destination = new URL(
    succeeded ? successfulDestination : "/login",
    getSiteUrl(),
  );
  if (!succeeded) destination.searchParams.set("error", "verification_failed");
  const response = NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store" },
  });
  if (succeeded && passwordSetupFlow) {
    if (authenticatedUser) {
      try {
        response.cookies.set(
          RECOVERY_COOKIE,
          await createRecoveryProof(authenticatedUser.id),
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/api/auth/password-update",
            maxAge: 10 * 60,
          },
        );
      } catch {
        // The Supabase OTP is already consumed. Fail into the normal recovery
        // flow so the user has a safe, repeatable way to set a password.
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        const fallback = new URL("/passwort-vergessen", getSiteUrl());
        fallback.searchParams.set("reason", "setup_retry");
        return NextResponse.redirect(fallback, {
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
  }
  return response;
}
