import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requireCheckoutIntent } from "@/lib/server/checkout-intent";

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const entry = value[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

function readAddress(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resumeBilling(
  snapshot: Record<string, unknown>,
): Record<string, unknown> | null {
  const billingType = snapshot.billingType;
  const firstName = readString(snapshot, "firstName");
  const lastName = readString(snapshot, "lastName");
  const billingAddress = readAddress(snapshot.billingAddress);
  const companyAddress = readAddress(snapshot.companyAddress);
  const primaryAddress =
    billingType === "business" ? companyAddress : billingAddress;
  if (
    (billingType !== "private" && billingType !== "business") ||
    !firstName ||
    !lastName ||
    !primaryAddress
  ) {
    return null;
  }
  const street = readString(primaryAddress, "street");
  const postalCode = readString(primaryAddress, "postalCode");
  const city = readString(primaryAddress, "city");
  const country = readString(primaryAddress, "country");
  if (!street || !postalCode || !city || !country) return null;

  const differentBillingAddress =
    billingType === "business" && snapshot.differentBillingAddress === true;
  if (differentBillingAddress && !billingAddress) return null;

  return {
    billingType,
    firstName,
    lastName,
    companyName: readString(snapshot, "companyName") ?? "",
    contactPerson: readString(snapshot, "contactPerson") ?? "",
    legalForm: readString(snapshot, "legalForm") ?? "",
    companyCountry: billingType === "business" ? country : undefined,
    street,
    postalCode,
    city,
    country,
    differentBillingAddress,
    billingStreet:
      differentBillingAddress && billingAddress
        ? (readString(billingAddress, "street") ?? "")
        : "",
    billingPostalCode:
      differentBillingAddress && billingAddress
        ? (readString(billingAddress, "postalCode") ?? "")
        : "",
    billingCity:
      differentBillingAddress && billingAddress
        ? (readString(billingAddress, "city") ?? "")
        : "",
    billingCountry:
      differentBillingAddress && billingAddress
        ? (readString(billingAddress, "country") ?? "")
        : country,
    taxId: readString(snapshot, "taxId") ?? "",
  };
}

export async function GET() {
  try {
    const intent = await requireCheckoutIntent();
    await enforceRateLimit({
      bucket: "checkout-intent-status",
      subject: intent.id,
      maximum: 40,
      windowSeconds: 600,
    });
    const ready =
      Boolean(intent.identity_authorized_at) &&
      ["ready", "email_verified", "open", "processing"].includes(intent.status);
    const retryAfter =
      intent.status === "processing" && intent.preparation_lease_expires_at
        ? Math.max(
            0,
            Math.ceil(
              (new Date(intent.preparation_lease_expires_at).getTime() -
                Date.now()) /
                1000,
            ),
          )
        : 0;
    const phase = ["ready", "email_verified"].includes(intent.status)
      ? "billing"
      : intent.status === "processing"
        ? "preparing_payment"
        : intent.status === "open"
          ? "payment"
          : ["paid", "provisioning"].includes(intent.status)
            ? "confirming_payment"
            : intent.status === "provisioned"
              ? "complete"
              : "terminal";
    const billing =
      phase === "payment" ? resumeBilling(intent.billing_snapshot) : null;
    return Response.json(
      {
        ready,
        status: intent.status,
        phase,
        retryAfter,
        redirectUrl:
          intent.stripe_checkout_session_id &&
          ["paid", "provisioning", "provisioned"].includes(intent.status)
            ? `/zahlung-erfolgreich?session_id=${encodeURIComponent(intent.stripe_checkout_session_id)}`
            : null,
        identity: {
          firstName: intent.first_name,
          lastName: intent.last_name,
          email: intent.email,
        },
        billing,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
