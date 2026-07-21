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
    return Response.json(
      {
        verified: Boolean(intent.email_verified_at),
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
