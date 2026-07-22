import { z } from "zod";

import { requireCheckoutIntent } from "@/lib/server/checkout-intent";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const inputSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .regex(/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/)
    .max(255),
  stage: z.enum(["address_sync", "validation", "confirmation"]),
  errorName: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(500),
});

function sanitizedDiagnostic(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(
      /\b(?:cs|pi|pm|cus|in|ch|seti|src|tok)_(?:test_|live_)?[A-Za-z0-9_]+\b/g,
      "[stripe-id]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{12,19}\b/g, "[number]")
    .slice(0, 500);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = inputSchema.parse(await readJson(request));
    const intent = await requireCheckoutIntent({ includeExpired: true });
    await enforceRateLimit({
      bucket: "checkout-intent-client-error",
      subject: intent.id,
      maximum: 12,
      windowSeconds: 600,
    });
    if (intent.stripe_checkout_session_id !== input.sessionId) {
      throw new HttpError(
        404,
        "Die Zahlungssitzung wurde nicht gefunden.",
        "checkout_session_not_found",
      );
    }

    // Operational diagnostics only: no participant data, billing data or
    // payment details are logged. Stripe identifiers and accidental long card
    // numbers are redacted before the message reaches Vercel logs.
    console.error("checkout_client_failure", {
      checkoutIntentId: intent.id,
      stage: input.stage,
      errorName: sanitizedDiagnostic(input.errorName),
      message: sanitizedDiagnostic(input.message),
      userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 240),
    });

    return new Response(null, {
      status: 204,
      headers: noStoreHeaders(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
