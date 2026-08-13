// @vitest-environment node
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readBoundCheckoutPrice } from "@/lib/server/checkout-session-pricing";

function checkoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    amount_subtotal: 14900,
    amount_total: 11920,
    currency: "eur",
    allow_promotion_codes: true,
    discounts: [{ coupon: "coupon_20", promotion_code: "promo_return20" }],
    line_items: {
      data: [
        {
          quantity: 1,
          price: {
            id: "price_course",
            unit_amount: 14900,
            currency: "eur",
          },
        },
      ],
    },
    total_details: {
      amount_discount: 2980,
      amount_shipping: 0,
      amount_tax: 1903,
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe("Stripe Checkout price binding", () => {
  it("accepts a positive Stripe Promotion Code total for the bound Price", () => {
    expect(
      readBoundCheckoutPrice(checkoutSession(), "price_course", {
        requirePayableTotal: true,
      })?.id,
    ).toBe("price_course");
  });

  it("rejects a discounted total without Stripe Promotion Code evidence", () => {
    expect(
      readBoundCheckoutPrice(
        checkoutSession({ allow_promotion_codes: false, discounts: null }),
        "price_course",
      ),
    ).toBeNull();
  });

  it("rejects a changed quantity, unit amount, or subtotal", () => {
    expect(
      readBoundCheckoutPrice(
        checkoutSession({ amount_subtotal: 14899 }),
        "price_course",
      ),
    ).toBeNull();
    expect(
      readBoundCheckoutPrice(
        checkoutSession({
          line_items: {
            data: [
              {
                quantity: 2,
                price: {
                  id: "price_course",
                  unit_amount: 14900,
                  currency: "eur",
                },
              },
            ],
          } as Stripe.ApiList<Stripe.LineItem>,
        }),
        "price_course",
      ),
    ).toBeNull();
  });

  it("allows a zero-total Session to be inspected but never paid/provisioned", () => {
    const freeSession = checkoutSession({
      amount_total: 0,
      total_details: {
        amount_discount: 14900,
        amount_shipping: 0,
        amount_tax: 0,
      },
    });

    expect(readBoundCheckoutPrice(freeSession, "price_course")).not.toBeNull();
    expect(
      readBoundCheckoutPrice(freeSession, "price_course", {
        requirePayableTotal: true,
      }),
    ).toBeNull();
  });
});
