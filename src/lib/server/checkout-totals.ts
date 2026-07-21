import type Stripe from "stripe";

export interface CheckoutTotals {
  status: "ready" | "pending";
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  taxBehavior: string | null;
  automaticTaxEnabled: boolean;
  automaticTaxStatus: Stripe.Checkout.Session.AutomaticTax.Status | null;
}

/**
 * Keeps every amount in Stripe's minor currency unit. A `pending` result must
 * never be presented as a final price or used to enable the payment CTA.
 */
export function getCheckoutTotals(
  session: Pick<
    Stripe.Checkout.Session,
    | "amount_subtotal"
    | "amount_total"
    | "total_details"
    | "currency"
    | "automatic_tax"
  >,
  taxBehavior: string | null,
): CheckoutTotals {
  const subtotal = session.amount_subtotal;
  const tax = session.total_details?.amount_tax ?? null;
  const total = session.amount_total;
  const currency = session.currency?.toLowerCase() ?? null;
  const automaticTaxStatus = session.automatic_tax.status;
  const automaticTaxReady =
    !session.automatic_tax.enabled || automaticTaxStatus === "complete";

  return {
    status:
      subtotal !== null &&
      tax !== null &&
      total !== null &&
      currency !== null &&
      automaticTaxReady
        ? "ready"
        : "pending",
    subtotal,
    tax,
    total,
    currency,
    taxBehavior,
    automaticTaxEnabled: session.automatic_tax.enabled,
    automaticTaxStatus,
  };
}
