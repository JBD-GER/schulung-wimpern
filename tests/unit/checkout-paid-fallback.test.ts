// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  intents: [] as Array<Record<string, unknown>>,
  requireIntent: vi.fn(),
  reconcile: vi.fn(),
  clearCookie: vi.fn(),
  consumeBootstrap: vi.fn(),
}));

function queryBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in"]) builder[method] = () => builder;
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table !== "orders") {
      throw new Error(`Unexpected table in paid fallback test: ${table}`);
    }
    return {
      select: vi.fn(() =>
        queryBuilder({
          data: {
            amount_total: 14900,
            currency: "eur",
            tax_amount: 2379,
            billing_snapshot: { productName: "Schulung Wimpernverlängerung" },
          },
          error: null,
        }),
      ),
    };
  }),
  rpc: state.consumeBootstrap,
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "20000000-0000-4000-8000-000000000001",
    email: "erika@example.de",
  })),
}));
vi.mock("@/lib/server/auth-sessions", () => ({
  observeAuthSession: vi.fn(),
}));
vi.mock("@/lib/server/checkout-intent", () => ({
  clearCheckoutIntentCookie: state.clearCookie,
  requireCheckoutIntent: state.requireIntent,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
}));
vi.mock("@/lib/server/stripe-webhook", () => ({
  reconcileStripeCheckoutSession: state.reconcile,
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "@/app/api/checkout/intent/complete/route";
import { HttpError } from "@/lib/server/http";

const sessionId = "cs_test_paid_fallback";
const userId = "20000000-0000-4000-8000-000000000001";
const orderId = "50000000-0000-4000-8000-000000000001";

const openIntent = {
  id: "40000000-0000-4000-8000-000000000001",
  stripe_checkout_session_id: sessionId,
  status: "open",
  auth_user_id: null,
  provisioned_order_id: null,
  expires_at: "2026-07-24T12:00:00.000Z",
};

const provisionedIntent = {
  ...openIntent,
  status: "provisioned",
  auth_user_id: userId,
  provisioned_order_id: orderId,
  identity_mode: "existing_authenticated",
  browser_token_hash: "a".repeat(64),
  bootstrap_consumed_at: null,
};

function request() {
  return new Request("http://localhost:3000/api/checkout/intent/complete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ sessionId }),
  });
}

describe("bezahlter Checkout ohne rechtzeitigen Webhook", () => {
  beforeEach(() => {
    state.intents = [];
    state.requireIntent.mockReset().mockImplementation(async () => {
      const next = state.intents.shift();
      if (!next) throw new Error("No checkout intent state queued.");
      return next;
    });
    state.reconcile.mockReset().mockResolvedValue("paid");
    state.clearCookie.mockReset().mockResolvedValue(undefined);
    state.consumeBootstrap.mockReset().mockResolvedValue({
      data: true,
      error: null,
    });
    admin.from.mockClear();
  });

  it("reconciliert die cookie-gebundene Stripe-Session und liefert danach den aktiven Zugang", async () => {
    state.intents.push(openIntent, provisionedIntent);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.reconcile).toHaveBeenCalledOnce();
    expect(state.reconcile).toHaveBeenCalledWith(sessionId);
    expect(state.consumeBootstrap).toHaveBeenCalledWith(
      "consume_checkout_intent_bootstrap",
      expect.objectContaining({
        target_intent_id: openIntent.id,
        authenticated_user_id: userId,
      }),
    );
    expect(state.clearCookie).toHaveBeenCalledOnce();
    expect(body).toMatchObject({
      status: "active",
      redirectUrl: "/dashboard",
      order: {
        amountTotal: 14900,
        currency: "eur",
        taxAmount: 2379,
      },
    });
  });

  it("wartet idempotent, wenn der Webhook bereits den Provisionierungs-Lease hält", async () => {
    state.intents.push(openIntent, {
      ...openIntent,
      status: "provisioning",
    });
    state.reconcile.mockRejectedValue(
      new HttpError(
        503,
        "Die bezahlte Kontoerstellung wird bereits verarbeitet.",
        "checkout_provisioning_in_progress",
      ),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "pending" });
    expect(state.consumeBootstrap).not.toHaveBeenCalled();
    expect(state.clearCookie).not.toHaveBeenCalled();
  });
});
