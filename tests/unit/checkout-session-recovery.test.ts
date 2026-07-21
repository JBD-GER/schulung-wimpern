// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkoutSessionDisposition,
  supersededCheckoutSessionCanRelease,
} from "@/lib/server/checkout-session-state";

describe("Checkout-Session-Recovery", () => {
  it("gibt ausschließlich offene Sessions mit Client-Secret an den Browser", () => {
    expect(
      checkoutSessionDisposition({ status: "open", client_secret: "secret" }),
    ).toBe("usable");
    expect(
      checkoutSessionDisposition({ status: "open", client_secret: null }),
    ).toBe("rotate");
    expect(
      checkoutSessionDisposition({ status: "expired", client_secret: "stale" }),
    ).toBe("rotate");
    expect(
      checkoutSessionDisposition({ status: "complete", client_secret: null }),
    ).toBe("processing");
  });

  it("gibt einen Rotationsblocker nur nach Stripe- oder Webhook-Terminalstatus frei", () => {
    expect(
      supersededCheckoutSessionCanRelease(
        { status: "expired", payment_status: "unpaid" },
        "expired",
      ),
    ).toBe(true);
    expect(
      supersededCheckoutSessionCanRelease(
        { status: "complete", payment_status: "unpaid" },
        "failed",
      ),
    ).toBe(true);
    expect(
      supersededCheckoutSessionCanRelease(
        { status: "complete", payment_status: "unpaid" },
        "expired",
      ),
    ).toBe(false);
    expect(
      supersededCheckoutSessionCanRelease(
        { status: "complete", payment_status: "paid" },
        "failed",
      ),
    ).toBe(false);
    expect(
      supersededCheckoutSessionCanRelease(
        { status: "open", payment_status: "unpaid" },
        "failed",
      ),
    ).toBe(false);
  });

  it("rotiert nach einem abgelaufenen idempotenten Stripe-Ergebnis auf eine neue Order", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/checkout/session/route.ts"),
      "utf8",
    );
    const rotateStart = source.indexOf('if (disposition === "rotate")');
    const rotateEnd = source.indexOf("session = candidate", rotateStart);
    const rotateBlock = source.slice(rotateStart, rotateEnd);

    expect(rotateStart).toBeGreaterThan(-1);
    expect(rotateBlock.indexOf("await expireOrder(order.id)")).toBeGreaterThan(
      -1,
    );
    expect(
      rotateBlock.indexOf("order = await claimOrderAndConfirmRotation()"),
    ).toBeGreaterThan(rotateBlock.indexOf("await expireOrder(order.id)"));
    expect(source).toContain(
      "{ idempotencyKey: `checkout-session-${order.id}` }",
    );
    expect(source).toContain("confirm_checkout_session_rotation");
    expect(source).toContain("claimedOrder.rotatedSessionId");
  });

  it("persistiert eine wiedergefundene Stripe-Session vor jeder Disposition fail-closed", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/checkout/session/route.ts"),
      "utf8",
    );
    const linkCall = source.indexOf(
      "await linkCheckoutSession(order.id, candidate.id)",
    );
    const failureStart = source.lastIndexOf("if (", linkCall);
    const dispositionStart = source.indexOf(
      "const disposition = belongsToOrder",
    );
    const failureEnd = source.indexOf(
      "const candidateCustomerId",
      failureStart,
    );
    const failureBlock = source.slice(failureStart, failureEnd);

    expect(linkCall).toBeGreaterThan(-1);
    expect(failureStart).toBeGreaterThan(-1);
    expect(failureStart).toBeLessThan(dispositionStart);
    expect(failureBlock).not.toContain("expireStripeSession");
    expect(failureBlock).not.toContain("expireOrder");
    expect(failureBlock).toContain(
      '"Die Zahlungssitzung konnte nicht sicher gespeichert werden."',
    );
    expect(source).toContain("recoverUnlinkedCheckoutSession(order.id)");
    expect(source).toContain("stripe.checkout.sessions.list");
  });
});
