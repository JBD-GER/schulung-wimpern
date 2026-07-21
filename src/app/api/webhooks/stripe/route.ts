export const runtime = "nodejs";

import { jsonError } from "@/lib/server/http";
import { processStripeWebhook } from "@/lib/server/stripe-webhook";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return Response.json({ received: false }, { status: 400 });
    await processStripeWebhook(await request.text(), signature);
    return Response.json({ received: true });
  } catch (error) {
    return jsonError(error);
  }
}
