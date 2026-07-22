import "server-only";

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import {
  buildContractConfirmationText,
  readCheckoutContractSnapshot,
} from "@/data/checkout-legal";
import { optionalEnv, requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { sendEnrollmentActivatedEmail } from "./email";
import { HttpError } from "./http";

export const CHECKOUT_INTENT_COOKIE = "swv_checkout_intent";

export type CheckoutIntentRow = {
  id: string;
  auth_user_id: string | null;
  provisioned_order_id: string | null;
  course_id: string;
  course_version: string;
  email: string;
  first_name: string;
  last_name: string;
  browser_token_hash: string;
  email_verification_token_hash: string | null;
  email_verified_at: string | null;
  identity_mode:
    "new_account_password" | "existing_authenticated" | "legacy_email_verified";
  identity_authorized_at: string | null;
  signup_password_hash: string | null;
  password_set_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  stripe_price_id: string;
  billing_fingerprint: string | null;
  billing_snapshot: Record<string, unknown>;
  consent_snapshot: Record<string, unknown>;
  amount_total: number | null;
  currency: string | null;
  tax_amount: number | null;
  business_purchase: boolean;
  status: string;
  paid_at: string | null;
  bootstrap_consumed_at: string | null;
  contract_confirmation_text: string | null;
  contract_confirmation_sha256: string | null;
  expires_at: string;
};

function checkoutIntentSecret(): string {
  const secret = requireEnv("CHECKOUT_INTENT_SECRET");
  if (secret.length < 32) {
    throw new Error(
      "CHECKOUT_INTENT_SECRET muss mindestens 32 Zeichen lang sein.",
    );
  }
  return secret;
}

export function checkoutIntentTtlSeconds(): number {
  const configured = Number(optionalEnv("CHECKOUT_INTENT_TTL_SECONDS") ?? 3600);
  if (
    !Number.isSafeInteger(configured) ||
    configured < 1800 ||
    configured > 86400
  ) {
    throw new Error(
      "CHECKOUT_INTENT_TTL_SECONDS muss zwischen 1800 und 86400 liegen.",
    );
  }
  return configured;
}

export function createCheckoutIntentToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCheckoutIntentToken(token: string): string {
  return createHmac("sha256", checkoutIntentSecret())
    .update(token, "utf8")
    .digest("hex");
}

export function encodeCheckoutIntentCookie(
  intentId: string,
  token: string,
): string {
  return `${intentId}.${token}`;
}

function parseCheckoutIntentCookie(value?: string): {
  intentId: string;
  tokenHash: string;
} | null {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator < 1) return null;
  const intentId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      intentId,
    ) ||
    !/^[A-Za-z0-9_-]{40,64}$/.test(token)
  ) {
    return null;
  }
  return { intentId, tokenHash: hashCheckoutIntentToken(token) };
}

export async function setCheckoutIntentCookie(
  intentId: string,
  token: string,
): Promise<void> {
  (await cookies()).set(
    CHECKOUT_INTENT_COOKIE,
    encodeCheckoutIntentCookie(intentId, token),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: checkoutIntentTtlSeconds(),
      priority: "high",
    },
  );
}

export async function clearCheckoutIntentCookie(): Promise<void> {
  (await cookies()).set(CHECKOUT_INTENT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    priority: "high",
  });
}

export async function refreshCheckoutIntentCookie(
  expiresAt: Date,
): Promise<void> {
  const remainingSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 60) {
    throw new Error("Die Checkout-Cookie-Laufzeit ist ungültig.");
  }
  const cookieStore = await cookies();
  const current = cookieStore.get(CHECKOUT_INTENT_COOKIE)?.value;
  if (!current || !parseCheckoutIntentCookie(current)) {
    throw new HttpError(
      401,
      "Deine sichere Checkout-Sitzung ist nicht mehr verfügbar.",
      "checkout_intent_required",
    );
  }
  cookieStore.set(CHECKOUT_INTENT_COOKIE, current, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.min(remainingSeconds, 172800),
    priority: "high",
  });
}

export async function readCheckoutIntentCookie(): Promise<{
  intentId: string;
  tokenHash: string;
} | null> {
  return parseCheckoutIntentCookie(
    (await cookies()).get(CHECKOUT_INTENT_COOKIE)?.value,
  );
}

export async function requireCheckoutIntent(options?: {
  includeExpired?: boolean;
}): Promise<CheckoutIntentRow> {
  const binding = await readCheckoutIntentCookie();
  if (!binding) {
    throw new HttpError(
      401,
      "Deine sichere Checkout-Sitzung ist nicht mehr verfügbar.",
      "checkout_intent_required",
    );
  }
  const { data, error } = await getSupabaseAdmin()
    .from("checkout_intents")
    .select("*")
    .eq("id", binding.intentId)
    .eq("browser_token_hash", binding.tokenHash)
    .maybeSingle();
  if (error) {
    throw new HttpError(
      503,
      "Die sichere Checkout-Sitzung kann gerade nicht geprüft werden.",
    );
  }
  if (!data) {
    throw new HttpError(
      401,
      "Deine sichere Checkout-Sitzung ist nicht mehr gültig.",
      "checkout_intent_invalid",
    );
  }
  const intent = data as CheckoutIntentRow;
  if (
    !options?.includeExpired &&
    new Date(intent.expires_at).getTime() <= Date.now()
  ) {
    throw new HttpError(
      410,
      "Deine Checkout-Sitzung ist abgelaufen. Bitte beginne erneut.",
      "checkout_intent_expired",
    );
  }
  return intent;
}

export async function resolveAuthUserByEmail(
  normalizedEmail: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "find_auth_user_by_checkout_email",
    { normalized_email: normalizedEmail },
  );
  if (error) {
    throw new HttpError(
      503,
      "Die E-Mail-Adresse kann gerade nicht sicher geprüft werden.",
    );
  }
  return typeof data === "string" ? data : null;
}

async function verifiedProvisioningUser(
  intent: CheckoutIntentRow,
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (intent.auth_user_id) {
    const { data, error } = await admin.auth.admin.getUserById(
      intent.auth_user_id,
    );
    if (
      error ||
      !data.user ||
      data.user.email?.trim().toLowerCase() !== intent.email ||
      !data.user.email_confirmed_at ||
      (intent.identity_mode === "new_account_password" &&
        data.user.app_metadata?.checkout_intent_id !== intent.id)
    ) {
      throw new HttpError(
        503,
        "Das vorhandene Teilnehmerkonto passt nicht zur bestätigten Zahlung.",
        "checkout_auth_user_mismatch",
      );
    }
    return data.user.id;
  }

  if (intent.identity_mode === "existing_authenticated") {
    throw new HttpError(
      503,
      "Das vor der Zahlung angemeldete Teilnehmerkonto ist nicht mehr gebunden.",
      "checkout_auth_user_mismatch",
    );
  }

  if (intent.identity_mode === "new_account_password") {
    const { data: recovered, error: recoveryError } = await admin.rpc(
      "find_checkout_intent_auth_user",
      { target_intent_id: intent.id },
    );
    if (recoveryError) {
      throw new HttpError(
        503,
        "Die Kontoerstellung kann gerade nicht fortgesetzt werden.",
      );
    }
    if (typeof recovered === "string") return recovered;
  }

  const existingUserId = await resolveAuthUserByEmail(intent.email);
  if (existingUserId) {
    if (intent.identity_mode === "new_account_password") {
      throw new HttpError(
        409,
        "Unter dieser E-Mail-Adresse ist zwischenzeitlich ein anderes Konto entstanden. Die Zahlung bleibt dokumentiert, aber das fremde Konto wird nicht übernommen.",
        "checkout_identity_collision_after_payment",
      );
    }
    const { data: existing, error: existingError } =
      await admin.auth.admin.getUserById(existingUserId);
    if (
      existingError ||
      !existing.user ||
      !existing.user.email_confirmed_at ||
      existing.user.email?.trim().toLowerCase() !== intent.email
    ) {
      throw new HttpError(
        503,
        "Das zwischenzeitlich angelegte Teilnehmerkonto kann nicht sicher gebunden werden.",
        "existing_account_not_bound",
      );
    }
    return existing.user.id;
  }

  if (
    intent.identity_mode === "new_account_password" &&
    !intent.signup_password_hash
  ) {
    throw new HttpError(
      503,
      "Für das bezahlte Teilnehmerkonto fehlen die sicher hinterlegten Zugangsdaten.",
      "checkout_password_hash_missing",
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: intent.email,
    email_confirm: true,
    ...(intent.signup_password_hash
      ? { password_hash: intent.signup_password_hash }
      : {}),
    user_metadata: {
      first_name: intent.first_name,
      last_name: intent.last_name,
      certificate_name: `${intent.first_name} ${intent.last_name}`,
    },
    app_metadata: { checkout_intent_id: intent.id },
  });
  if (error || !data.user) {
    const { data: afterFailure } = await admin.rpc(
      "find_checkout_intent_auth_user",
      { target_intent_id: intent.id },
    );
    if (typeof afterFailure === "string") return afterFailure;
    throw new HttpError(
      503,
      "Das bezahlte Teilnehmerkonto konnte noch nicht erstellt werden.",
      "checkout_user_provisioning_failed",
    );
  }
  return data.user.id;
}

export function contractConfirmationForIntent(intent: CheckoutIntentRow) {
  const productName = intent.billing_snapshot.productName;
  if (
    typeof productName !== "string" ||
    !productName.trim() ||
    intent.amount_total === null ||
    !Number.isSafeInteger(intent.amount_total) ||
    !intent.currency ||
    !/^[a-z]{3}$/i.test(intent.currency) ||
    intent.tax_amount === null ||
    !Number.isSafeInteger(intent.tax_amount) ||
    !intent.paid_at
  ) {
    throw new HttpError(
      503,
      "Die dauerhafte Vertragsbestätigung kann noch nicht erstellt werden.",
      "contract_confirmation_incomplete",
    );
  }
  const immutableOrderFacts = {
    productName,
    amountTotal: intent.amount_total,
    currency: intent.currency,
    taxAmount: intent.tax_amount,
    paidAt: intent.paid_at,
  };

  // A provisioned purchase must always use the exact bytes frozen at the
  // moment of fulfillment. In particular, do not re-parse this historical
  // snapshot with today's legal copy: future wording changes must never make
  // an already concluded contract impossible to download or resend.
  if (
    intent.contract_confirmation_text !== null ||
    intent.contract_confirmation_sha256 !== null
  ) {
    if (
      !intent.contract_confirmation_text ||
      !intent.contract_confirmation_sha256 ||
      createHash("sha256")
        .update(intent.contract_confirmation_text, "utf8")
        .digest("hex") !== intent.contract_confirmation_sha256
    ) {
      throw new HttpError(
        503,
        "Die gespeicherte Vertragsbestätigung ist nicht integer.",
        "contract_confirmation_integrity_failed",
      );
    }
    return {
      ...immutableOrderFacts,
      text: intent.contract_confirmation_text,
      sha256: intent.contract_confirmation_sha256,
    };
  }
  if (intent.status === "provisioned") {
    throw new HttpError(
      503,
      "Für den freigeschalteten Zugang fehlt die gespeicherte Vertragsbestätigung.",
      "contract_confirmation_missing",
    );
  }

  const snapshot = readCheckoutContractSnapshot(
    intent.consent_snapshot.contract,
  );
  const invoiceName = intent.billing_snapshot.invoiceName;
  const billingAddress = intent.billing_snapshot.billingAddress;
  const paymentMethodLabel = intent.billing_snapshot.paymentMethodLabel;
  if (
    !snapshot ||
    typeof invoiceName !== "string" ||
    !invoiceName.trim() ||
    !billingAddress ||
    typeof billingAddress !== "object" ||
    Array.isArray(billingAddress) ||
    typeof paymentMethodLabel !== "string" ||
    !paymentMethodLabel.trim()
  ) {
    throw new HttpError(
      503,
      "Die dauerhafte Vertragsbestätigung kann noch nicht erstellt werden.",
      "contract_confirmation_incomplete",
    );
  }
  const generatedText = buildContractConfirmationText({
    snapshot,
    ...immutableOrderFacts,
    billingSnapshot: intent.billing_snapshot,
    orderId: intent.id,
    participantEmail: intent.email,
  });
  const generatedSha256 = createHash("sha256")
    .update(generatedText, "utf8")
    .digest("hex");
  return {
    ...immutableOrderFacts,
    text: generatedText,
    sha256: generatedSha256,
  };
}

export async function provisionPaidCheckoutIntent(
  intentId: string,
): Promise<{ userId: string; orderId: string; accessGranted: boolean }> {
  const admin = getSupabaseAdmin();
  const leaseToken = randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_checkout_intent_provisioning",
    {
      target_intent_id: intentId,
      requested_lease_token: leaseToken,
      lease_ttl_seconds: 300,
    },
  );
  if (claimError || claimed !== true) {
    const { data: current, error: currentError } = await admin
      .from("checkout_intents")
      .select("*")
      .eq("id", intentId)
      .maybeSingle();
    if (
      !currentError &&
      current?.status === "provisioned" &&
      current.auth_user_id &&
      current.provisioned_order_id
    ) {
      const currentIntent = current as CheckoutIntentRow;
      const sent = await sendEnrollmentActivatedEmail({
        userId: currentIntent.auth_user_id!,
        orderId: currentIntent.provisioned_order_id!,
        firstName: currentIntent.first_name,
        email: currentIntent.email,
        passwordCreatedDuringCheckout: Boolean(currentIntent.password_set_at),
        contractConfirmation: contractConfirmationForIntent(currentIntent),
      });
      if (!sent) {
        throw new HttpError(
          503,
          "Die Aktivierungs-E-Mail wartet auf einen erneuten Versand.",
        );
      }
      return {
        userId: currentIntent.auth_user_id!,
        orderId: currentIntent.provisioned_order_id!,
        accessGranted: false,
      };
    }
    throw new HttpError(
      503,
      "Die bezahlte Kontoerstellung wird bereits verarbeitet.",
      "checkout_provisioning_in_progress",
    );
  }

  const { data: row, error: rowError } = await admin
    .from("checkout_intents")
    .select("*")
    .eq("id", intentId)
    .single();
  if (rowError || !row) {
    throw new HttpError(
      503,
      "Der bezahlte Checkout kann nicht geladen werden.",
    );
  }
  const intent = row as CheckoutIntentRow;
  const passwordCreatedDuringCheckout = Boolean(
    intent.signup_password_hash || intent.password_set_at,
  );
  const contractConfirmation = contractConfirmationForIntent(intent);
  const userId = await verifiedProvisioningUser(intent);
  const { data: bound, error: bindError } = await admin.rpc(
    "bind_checkout_intent_auth_user",
    {
      target_intent_id: intent.id,
      requested_lease_token: leaseToken,
      provisioned_user_id: userId,
    },
  );
  if (bindError || bound !== true) {
    throw new HttpError(
      503,
      "Das bezahlte Konto konnte nicht sicher gebunden werden.",
    );
  }

  const { data: fulfillmentData, error: fulfillmentError } = await admin.rpc(
    "finalize_paid_checkout_intent",
    {
      target_intent_id: intent.id,
      requested_lease_token: leaseToken,
      provisioned_user_id: userId,
      submitted_contract_confirmation_text: contractConfirmation.text,
      submitted_contract_confirmation_sha256: contractConfirmation.sha256,
    },
  );
  const fulfillment = Array.isArray(fulfillmentData)
    ? fulfillmentData[0]
    : fulfillmentData;
  if (fulfillmentError || !fulfillment?.order_id) {
    throw new HttpError(
      503,
      "Die bezahlte Kursfreischaltung ist fehlgeschlagen.",
    );
  }

  const sent = await sendEnrollmentActivatedEmail({
    userId,
    orderId: fulfillment.order_id as string,
    firstName: intent.first_name,
    email: intent.email,
    passwordCreatedDuringCheckout,
    contractConfirmation,
  });
  if (!sent) {
    throw new HttpError(
      503,
      "Die Aktivierungs-E-Mail wartet auf einen erneuten Versand.",
    );
  }
  return {
    userId,
    orderId: fulfillment.order_id as string,
    accessGranted: fulfillment.access_granted === true,
  };
}
