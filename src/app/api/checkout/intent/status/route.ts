import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requireCheckoutIntent } from "@/lib/server/checkout-intent";

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
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
