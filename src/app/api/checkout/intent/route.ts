import { getCurrentUser } from "@/lib/server/auth";
import { requireStripeProduct } from "@/lib/server/catalog";
import {
  checkoutIntentTtlSeconds,
  createCheckoutIntentToken,
  hashCheckoutIntentToken,
  resolveAuthUserByEmail,
  setCheckoutIntentCookie,
} from "@/lib/server/checkout-intent";
import { hashCheckoutPassword } from "@/lib/server/checkout-password";
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
    await enforceRateLimit({
      bucket: "checkout-intent-create-ip",
      subject: requestSubject(request),
      maximum: 20,
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
    const existingUserId = await resolveAuthUserByEmail(input.email);
    if (!user && existingUserId) {
      throw new HttpError(
        409,
        "Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melde dich mit deinem Passwort an.",
        "checkout_login_required",
      );
    }
    if (user && existingUserId !== user.id) {
      throw new HttpError(
        409,
        "Das angemeldete Konto passt nicht sicher zu dieser E-Mail-Adresse.",
        "checkout_account_conflict",
      );
    }
    if (user && !user.email_confirmed_at) {
      throw new HttpError(
        409,
        "Das angemeldete Konto ist noch nicht vollständig aktiviert.",
        "checkout_account_unconfirmed",
      );
    }
    if (!user && !input.password) {
      throw new HttpError(
        400,
        "Bitte lege ein Passwort für dein neues Teilnehmerkonto fest.",
        "checkout_password_required",
      );
    }
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

    const browserToken = createCheckoutIntentToken();
    const now = Date.now();
    const signupPasswordHash =
      !user && input.password
        ? await hashCheckoutPassword(input.password)
        : null;
    const { data: intent, error: intentError } = await admin
      .from("checkout_intents")
      .insert({
        auth_user_id: user?.id ?? null,
        course_id: courseResult.data.id,
        course_version: courseResult.data.version,
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        browser_token_hash: hashCheckoutIntentToken(browserToken),
        email_verification_token_hash: null,
        email_verified_at: user?.email_confirmed_at ?? null,
        identity_mode: user ? "existing_authenticated" : "new_account_password",
        identity_authorized_at: new Date(now).toISOString(),
        signup_password_hash: signupPasswordHash,
        stripe_price_id: product.priceId,
        status: "ready",
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

    return Response.json(
      {
        ok: true,
        ready: true,
        accountMode: user ? "existing" : "new",
        identity: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
      },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
