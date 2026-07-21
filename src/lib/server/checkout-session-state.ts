import type Stripe from "stripe";

export type CheckoutSessionDisposition = "usable" | "rotate" | "processing";

/**
 * Only an open Elements Checkout Session with a client secret can be returned
 * to the browser. Expired, malformed, or otherwise unusable sessions must be
 * retired together with their local order so a new idempotency key is used.
 */
export function checkoutSessionDisposition(
  session: Pick<Stripe.Checkout.Session, "client_secret" | "status">,
): CheckoutSessionDisposition {
  if (session.status === "complete") return "processing";
  if (session.status === "open" && session.client_secret) return "usable";
  return "rotate";
}

export function supersededCheckoutSessionCanRelease(
  session: Pick<Stripe.Checkout.Session, "payment_status" | "status">,
  localOrderStatus?: string | null,
): boolean {
  if (session.status === "expired") return true;
  return (
    session.status === "complete" &&
    session.payment_status !== "paid" &&
    localOrderStatus === "failed"
  );
}
