// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stripeCheckoutIntegrationIdentifier } from "@/lib/server/stripe-integration";

describe("Stripe Checkout integration identifier", () => {
  it("is retry-stable and ends in eight distributed letters", () => {
    const first = stripeCheckoutIntegrationIdentifier(
      "018f7d53-6fa1-7b36-b618-36ad8ff83242",
    );
    const retry = stripeCheckoutIntegrationIdentifier(
      "018f7d53-6fa1-7b36-b618-36ad8ff83242",
    );
    const other = stripeCheckoutIntegrationIdentifier(
      "018f7d53-6fa1-7b36-b618-36ad8ff83243",
    );

    expect(first).toBe(retry);
    expect(first).toMatch(/^schulungwimpern_[a-z]{8}$/);
    expect(other).not.toBe(first);
  });
});
