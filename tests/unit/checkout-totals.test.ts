// @vitest-environment node
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { getCheckoutTotals } from "@/lib/server/checkout-totals";

function stripeTotals(
  overrides: Partial<
    Pick<
      Stripe.Checkout.Session,
      | "amount_subtotal"
      | "amount_total"
      | "total_details"
      | "currency"
      | "automatic_tax"
    >
  > = {},
) {
  return {
    amount_subtotal: 34900,
    amount_total: 41531,
    currency: "EUR",
    total_details: {
      amount_discount: 0,
      amount_shipping: 0,
      amount_tax: 6631,
    },
    automatic_tax: {
      enabled: true,
      liability: null,
      provider: null,
      status: "complete" as const,
    },
    ...overrides,
  };
}

describe("Stripe-authoritative checkout totals", () => {
  it("returns final minor-unit amounts only after automatic tax is complete", () => {
    expect(getCheckoutTotals(stripeTotals(), "exclusive")).toEqual({
      status: "ready",
      subtotal: 34900,
      tax: 6631,
      total: 41531,
      currency: "eur",
      taxBehavior: "exclusive",
      automaticTaxEnabled: true,
      automaticTaxStatus: "complete",
    });
  });

  it("keeps otherwise populated amounts pending while Stripe needs location input", () => {
    const totals = getCheckoutTotals(
      stripeTotals({
        automatic_tax: {
          enabled: true,
          liability: null,
          provider: null,
          status: "requires_location_inputs",
        },
      }),
      "exclusive",
    );

    expect(totals.status).toBe("pending");
    expect(totals.automaticTaxStatus).toBe("requires_location_inputs");
  });

  it("preserves nulls instead of manufacturing a zero or catalog total", () => {
    const totals = getCheckoutTotals(
      stripeTotals({
        amount_total: null,
        total_details: null,
        currency: null,
      }),
      null,
    );

    expect(totals).toMatchObject({
      status: "pending",
      tax: null,
      total: null,
      currency: null,
    });
  });

  it("accepts Stripe's explicit zero tax when automatic tax is disabled", () => {
    const totals = getCheckoutTotals(
      stripeTotals({
        amount_total: 34900,
        total_details: {
          amount_discount: 0,
          amount_shipping: 0,
          amount_tax: 0,
        },
        automatic_tax: {
          enabled: false,
          liability: null,
          provider: null,
          status: null,
        },
      }),
      "inclusive",
    );

    expect(totals).toMatchObject({ status: "ready", tax: 0, total: 34900 });
  });
});
