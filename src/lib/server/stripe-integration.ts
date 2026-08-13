import "server-only";

import { createHash } from "node:crypto";

/**
 * Stripe recommends an eight-letter suffix for Checkout integration labels.
 * Deriving it from the immutable local checkout ID keeps retries compatible
 * with Stripe's idempotency contract while still distributing the labels.
 */
export function stripeCheckoutIntegrationIdentifier(checkoutId: string) {
  const digest = createHash("sha256").update(checkoutId).digest();
  const suffix = Array.from(digest.subarray(0, 8), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");

  return `schulungwimpern_${suffix}`;
}
