import "server-only";

import type Stripe from "stripe";

function expandableId(
  value: string | { id: string } | null | undefined,
): string {
  return typeof value === "string" ? value : (value?.id ?? "");
}

function validMinorUnitAmount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Proves that a Checkout Session still contains exactly the catalog Price and
 * quantity that the server bound to it. A lower final total is accepted only
 * when Stripe itself supplies one Promotion Code discount.
 */
export function readBoundCheckoutPrice(
  session: Stripe.Checkout.Session,
  expectedPriceId: string,
  { requirePayableTotal = false }: { requirePayableTotal?: boolean } = {},
): Stripe.Price | null {
  const lineItems = session.line_items?.data ?? [];
  const lineItem = lineItems.length === 1 ? lineItems[0] : null;
  const price = lineItem?.price;
  if (
    !lineItem ||
    lineItem.quantity !== 1 ||
    !price ||
    typeof price === "string" ||
    price.id !== expectedPriceId ||
    !validMinorUnitAmount(price.unit_amount) ||
    session.amount_subtotal !== price.unit_amount ||
    !session.currency ||
    price.currency.toLowerCase() !== session.currency.toLowerCase()
  ) {
    return null;
  }

  const discount = session.total_details?.amount_discount ?? null;
  const tax = session.total_details?.amount_tax ?? null;
  if (
    (discount !== null && !validMinorUnitAmount(discount)) ||
    (tax !== null && !validMinorUnitAmount(tax)) ||
    (session.amount_total !== null &&
      !validMinorUnitAmount(session.amount_total)) ||
    (discount !== null && discount > session.amount_subtotal)
  ) {
    return null;
  }

  if (discount !== null && discount > 0) {
    const discounts = session.discounts ?? [];
    const promotionDiscounts = discounts.filter((item) =>
      Boolean(expandableId(item.promotion_code)),
    );
    if (discounts.length !== 1 || promotionDiscounts.length !== 1) {
      return null;
    }
  }

  if (
    requirePayableTotal &&
    (!validMinorUnitAmount(session.amount_total) || session.amount_total === 0)
  ) {
    return null;
  }

  return price;
}
