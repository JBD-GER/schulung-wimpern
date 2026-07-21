import { getCurrentUser } from "@/lib/server/auth";
import { requireStripeProduct } from "@/lib/server/catalog";
import {
  checkoutIntentTtlSeconds,
  clearCheckoutIntentCookie,
  createCheckoutIntentToken,
  hashCheckoutIntentToken,
  setCheckoutIntentCookie,
} from "@/lib/server/checkout-intent";
import { sendCheckoutVerificationEmail } from "@/lib/server/email";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkoutIdentitySchema } from "@/lib/validation/checkout";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = checkoutIdentitySchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "checkout-intent-create",
      subject: `${requestSubject(request)}:${input.email}`,
      maximum: 5,
      windowSeconds: 3600,
    });

    const [user, product, courseResult] = await Promise.all([
      getCurrentUser(),
      requireStripeProduct(),
      getSupabaseAdmin()
        .from("courses")
        .select("id,version")
        .eq("slug", "online-schulung-wimpernverlaengerung")
        .eq("status", "published")
        .single(),
    ]);
    if (courseResult.error || !courseResult.data) {
      throw new HttpError(
        503,
        "Der Kurs ist derzeit nicht für den Verkauf konfiguriert.",
        "course_unavailable",
      );
    }
    if (
      user &&
      (!user.email || user.email.trim().toLowerCase() !== input.email)
    ) {
      throw new HttpError(
        409,
        "Die Checkout-Adresse muss mit deinem angemeldeten Konto übereinstimmen.",
        "checkout_email_mismatch",
      );
    }

    const admin = getSupabaseAdmin();
    if (user) {
      const { data: access, error: accessError } = await admin
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseResult.data.id)
        .in("status", ["active", "completed"])
        .maybeSingle();
      if (accessError) {
        throw new HttpError(
          503,
          "Der bestehende Kurszugang kann gerade nicht geprüft werden.",
        );
      }
      if (access) {
        throw new HttpError(
          409,
          "Du besitzt bereits einen aktiven Zugang zu dieser Schulung.",
          "already_enrolled",
        );
      }
    }

    const verifiedUser = user?.email_confirmed_at ? user : null;
    const browserToken = createCheckoutIntentToken();
    const emailToken = verifiedUser ? null : createCheckoutIntentToken();
    const now = Date.now();
    const { data: intent, error: intentError } = await admin
      .from("checkout_intents")
      .insert({
        auth_user_id: verifiedUser?.id ?? null,
        course_id: courseResult.data.id,
        course_version: courseResult.data.version,
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        browser_token_hash: hashCheckoutIntentToken(browserToken),
        email_verification_token_hash: emailToken
          ? hashCheckoutIntentToken(emailToken)
          : null,
        email_verified_at: verifiedUser ? new Date(now).toISOString() : null,
        stripe_price_id: product.priceId,
        status: verifiedUser ? "email_verified" : "draft",
        expires_at: new Date(
          now + checkoutIntentTtlSeconds() * 1000,
        ).toISOString(),
      })
      .select("id")
      .single();
    if (intentError || !intent) {
      throw new HttpError(
        503,
        "Die sichere Checkout-Sitzung konnte nicht angelegt werden.",
      );
    }
    await setCheckoutIntentCookie(intent.id, browserToken);

    if (emailToken) {
      const sent = await sendCheckoutVerificationEmail({
        intentId: intent.id,
        firstName: input.firstName,
        email: input.email,
        token: emailToken,
      });
      if (!sent) {
        await admin
          .from("checkout_intents")
          .update({ status: "failed" })
          .eq("id", intent.id)
          .eq("status", "draft");
        await clearCheckoutIntentCookie();
        throw new HttpError(
          503,
          "Die Bestätigungs-E-Mail konnte noch nicht versendet werden. Bitte versuche es gleich erneut.",
          "checkout_verification_email_failed",
        );
      }
    }

    return Response.json(
      {
        ok: true,
        emailVerificationRequired: !verifiedUser,
        identity: input,
      },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
