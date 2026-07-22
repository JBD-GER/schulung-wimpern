// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("Pre-Payment-Checkout-Recovery", () => {
  it("überschreibt einen passenden cookie-gebundenen Intent nicht blind", () => {
    const route = read("src/app/api/checkout/intent/route.ts");
    const cookieLookup = route.indexOf("readCheckoutIntentCookie()");
    const insert = route.indexOf('.from("checkout_intents")\n      .insert');

    expect(cookieLookup).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(cookieLookup);
    expect(route).toContain("verifyCheckoutPassword");
    expect(route).toContain("resumed: true");
    expect(route).toContain('"checkout_active_conflict"');
    expect(route).toContain("refreshCheckoutIntentCookie");
  });

  it("trennt echte RPC-Fehler von einer belegten Preparation-Lease", () => {
    const route = read("src/app/api/checkout/intent/session/route.ts");
    const rpcError = route.indexOf("if (leaseError)");
    const contention = route.indexOf("if (acquired !== true)");

    expect(route).toContain("lease_ttl_seconds: 90");
    expect(route).toContain("export const maxDuration = 60");
    expect(rpcError).toBeGreaterThan(-1);
    expect(contention).toBeGreaterThan(rpcError);
    expect(route).toContain('"checkout_preparation_unavailable"');
    expect(route).toContain('"Retry-After": String(retryAfter)');
    expect(route).toContain("reconcileExpiredSiblingPayment");
  });

  it("bindet Session und Ablauf nur unter der aktuellen Lease per CAS", () => {
    const route = read("src/app/api/checkout/intent/session/route.ts");
    const linkStart = route.indexOf("stripe_checkout_session_id: session.id");
    const extensionStart = route.indexOf(
      ".update({ expires_at: browserBindingExpiresAt.toISOString() })",
    );
    const linkBlock = route.slice(linkStart, linkStart + 1_500);
    const extensionBlock = route.slice(extensionStart, extensionStart + 650);

    expect(linkBlock).toContain('.eq("preparation_lease_token", leaseToken)');
    expect(linkBlock).toContain('.eq("status", "processing")');
    expect(linkBlock).toContain("expireConfirmedUnboundSession");
    expect(linkBlock).toContain("linkWasPersisted");
    expect(extensionBlock).toContain(
      '.eq("stripe_checkout_session_id", session.id)',
    );
    expect(extensionBlock).toContain('.in("status", ["processing", "open"])');
    expect(route).toContain("extensionWasPersisted");
  });

  it("serialisiert den Abbruch und akzeptiert bereits gelöschte Stripe-Kunden", () => {
    const route = read("src/app/api/checkout/intent/cancel/route.ts");

    expect(route).toContain('"acquire_checkout_intent_preparation"');
    expect(route).toContain("lease_ttl_seconds: 90");
    expect(route).toContain("export const maxDuration = 60");
    expect(route).toContain('.eq("preparation_lease_token", lease.token)');
    expect(route).toContain("isStripeResourceMissing");
    expect(route).toContain('error.code === "resource_missing"');
    expect(route).toContain('"release_checkout_intent_preparation"');
  });

  it("liefert dem Aufrufer einen beobachtbaren Checkout-Zustand", () => {
    const route = read("src/app/api/checkout/intent/status/route.ts");

    expect(route).toContain("status: intent.status");
    expect(route).toContain("phase");
    expect(route).toContain("retryAfter");
    expect(route).toContain('"preparing_payment"');
    expect(route).toContain('"confirming_payment"');
  });
});
