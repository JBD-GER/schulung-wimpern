import { getCurrentUser } from "@/lib/server/auth";
import { requireStripeProduct } from "@/lib/server/catalog";
import {
  checkoutIntentTtlSeconds,
  createCheckoutIntentToken,
  hashCheckoutIntentToken,
  readCheckoutIntentCookie,
  refreshCheckoutIntentCookie,
  resolveAuthUserByEmail,
  setCheckoutIntentCookie,
  type CheckoutIntentRow,
} from "@/lib/server/checkout-intent";
import {
  hashCheckoutPassword,
  verifyCheckoutPassword,
} from "@/lib/server/checkout-password";
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
    const identityMatches = async (candidate: CheckoutIntentRow) =>
      candidate.email === input.email &&
      candidate.first_name === input.firstName &&
      candidate.last_name === input.lastName &&
      candidate.course_id === courseResult.data.id &&
      candidate.course_version === courseResult.data.version &&
      candidate.stripe_price_id === product.priceId &&
      (user
        ? candidate.identity_mode === "existing_authenticated" &&
          candidate.auth_user_id === user.id
        : candidate.identity_mode === "new_account_password" &&
          candidate.auth_user_id === null &&
          Boolean(input.password) &&
          Boolean(candidate.signup_password_hash) &&
          (await verifyCheckoutPassword(
            input.password!,
            candidate.signup_password_hash!,
          )));

    // A previous response or cookie update can be lost after Stripe was
    // already opened. Recover that exact identity instead of inserting a new
    // `ready` row which would later collide with the one-payment unique index.
    const { data: activeSiblingRow, error: activeSiblingError } = await admin
      .from("checkout_intents")
      .select("*")
      .eq("email", input.email)
      .eq("course_id", courseResult.data.id)
      .in("status", ["processing", "open", "paid", "provisioning"])
      .maybeSingle();
    if (activeSiblingError) {
      throw new HttpError(
        503,
        "Ein bestehender Checkout kann gerade nicht sicher geprüft werden.",
        "checkout_resume_unavailable",
      );
    }
    if (activeSiblingRow) {
      const activeSibling = activeSiblingRow as CheckoutIntentRow;
      const activeSiblingCurrent =
        new Date(activeSibling.expires_at).getTime() > Date.now() + 60_000;
      if (activeSiblingCurrent) {
        const siblingIdentityMatches = await identityMatches(activeSibling);
        if (
          siblingIdentityMatches &&
          ["open", "processing"].includes(activeSibling.status)
        ) {
          const activeLeaseSeconds = activeSibling.preparation_lease_expires_at
            ? Math.ceil(
                (new Date(
                  activeSibling.preparation_lease_expires_at,
                ).getTime() -
                  Date.now()) /
                  1000,
              )
            : 0;
          if (activeSibling.status === "processing" && activeLeaseSeconds > 0) {
            throw new HttpError(
              409,
              `Dieser Checkout wird bereits vorbereitet. Bitte versuche es in etwa ${activeLeaseSeconds} Sekunden erneut.`,
              "checkout_in_progress",
            );
          }
          const recoveryToken = createCheckoutIntentToken();
          const { data: recovered, error: recoveryError } = await admin
            .from("checkout_intents")
            .update({
              browser_token_hash: hashCheckoutIntentToken(recoveryToken),
            })
            .eq("id", activeSibling.id)
            .eq("browser_token_hash", activeSibling.browser_token_hash)
            .eq("status", activeSibling.status)
            .select("id")
            .maybeSingle();
          if (recoveryError) {
            throw new HttpError(
              503,
              "Der bestehende Checkout konnte nicht sicher wieder gebunden werden.",
              "checkout_resume_unavailable",
            );
          }
          if (!recovered) {
            throw new HttpError(
              409,
              "Der bestehende Checkout wurde inzwischen in einem anderen Fenster fortgesetzt. Bitte versuche es erneut.",
              "checkout_state_changed",
            );
          }
          await setCheckoutIntentCookie(
            activeSibling.id,
            recoveryToken,
            new Date(activeSibling.expires_at),
          );
          return Response.json(
            {
              ok: true,
              ready: true,
              resumed: true,
              status: activeSibling.status,
              accountMode: user ? "existing" : "new",
              identity: {
                firstName: activeSibling.first_name,
                lastName: activeSibling.last_name,
                email: activeSibling.email,
              },
            },
            { headers: noStoreHeaders() },
          );
        }
        const matchingPaymentPending =
          siblingIdentityMatches &&
          ["paid", "provisioning"].includes(activeSibling.status);
        throw new HttpError(
          409,
          matchingPaymentPending
            ? "Für diese Buchung wird bereits eine Zahlung bestätigt. Bitte öffne keine zweite Buchung."
            : "Für diese E-Mail-Adresse ist bereits ein anderer Checkout aktiv. Verwende exakt dieselben Teilnehmerdaten und Zugangsdaten oder beende zuerst den vorherigen Checkout.",
          matchingPaymentPending
            ? "checkout_payment_pending"
            : "checkout_active_conflict",
        );
      }
    }

    const existingBinding = await readCheckoutIntentCookie();
    if (existingBinding) {
      const { data: existingRow, error: existingIntentError } = await admin
        .from("checkout_intents")
        .select("*")
        .eq("id", existingBinding.intentId)
        .eq("browser_token_hash", existingBinding.tokenHash)
        .maybeSingle();
      if (existingIntentError) {
        throw new HttpError(
          503,
          "Der bestehende Checkout kann gerade nicht sicher geprüft werden.",
          "checkout_resume_unavailable",
        );
      }
      if (existingRow) {
        const existing = existingRow as CheckoutIntentRow;
        const existingIsCurrent =
          new Date(existing.expires_at).getTime() > Date.now() + 60_000 &&
          !["failed", "expired"].includes(existing.status);
        if (existingIsCurrent) {
          const existingIdentityMatches = await identityMatches(existing);
          if (
            existingIdentityMatches &&
            ["ready", "email_verified", "open", "processing"].includes(
              existing.status,
            )
          ) {
            await refreshCheckoutIntentCookie(new Date(existing.expires_at));
            return Response.json(
              {
                ok: true,
                ready: true,
                resumed: true,
                status: existing.status,
                accountMode: user ? "existing" : "new",
                identity: {
                  firstName: existing.first_name,
                  lastName: existing.last_name,
                  email: existing.email,
                },
              },
              { headers: noStoreHeaders() },
            );
          }
          const matchingPaymentPending =
            existingIdentityMatches &&
            (existing.status === "paid" || existing.status === "provisioning");
          const matchingCompleted =
            existingIdentityMatches && existing.status === "provisioned";
          throw new HttpError(
            409,
            matchingPaymentPending
              ? "Die Zahlung dieses Checkouts wird bereits bestätigt. Bitte öffne keine zweite Buchung."
              : matchingCompleted
                ? "Dieser Checkout wurde bereits erfolgreich abgeschlossen."
                : "In diesem Browser ist bereits ein anderer Checkout geöffnet. Bitte brich ihn zuerst ab, bevor du neue Teilnehmerdaten verwendest.",
            matchingPaymentPending
              ? "checkout_payment_pending"
              : matchingCompleted
                ? "checkout_already_completed"
                : "checkout_active_conflict",
          );
        }
      }
    }
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
