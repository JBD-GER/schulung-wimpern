// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  reconcile: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}));

function candidateQuery() {
  const query: Record<string, unknown> = {};
  for (const method of ["is", "not", "in", "lt", "or", "order"]) {
    query[method] = () => query;
  }
  query.limit = async () => ({
    data: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        stripe_checkout_session_id: "cs_test_paid",
        status: "open",
      },
      {
        id: "40000000-0000-4000-8000-000000000002",
        stripe_checkout_session_id: "cs_test_pending",
        status: "open",
      },
    ],
    error: null,
  });
  return query;
}

function updateQuery() {
  const query: Record<string, unknown> = {};
  for (const method of ["eq", "is", "in"]) query[method] = () => query;
  return query;
}

const admin = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => candidateQuery()),
    update: vi.fn((value: Record<string, unknown>) => {
      state.updates.push(value);
      return updateQuery();
    }),
  })),
}));

vi.mock("@/lib/env", () => ({ requireEnv: () => "cron-secret" }));
vi.mock("@/lib/server/stripe-webhook", () => ({
  reconcileStripeCheckoutSession: state.reconcile,
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));

import { GET } from "@/app/api/cron/checkout-reconcile/route";

function request(token = "cron-secret") {
  return new Request("http://localhost:3000/api/cron/checkout-reconcile", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("unabhängige Stripe-Checkout-Reconciliation", () => {
  beforeEach(() => {
    state.updates = [];
    state.reconcile
      .mockReset()
      .mockResolvedValueOnce("paid")
      .mockResolvedValueOnce("pending");
    admin.from.mockClear();
  });

  it("prüft gedrosselt offene Sessions und übernimmt bezahlte Evidenz", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      checked: 2,
      paid: 1,
      pending: 1,
      failed: 0,
    });
    expect(state.reconcile).toHaveBeenNthCalledWith(1, "cs_test_paid");
    expect(state.reconcile).toHaveBeenNthCalledWith(2, "cs_test_pending");
    expect(state.updates).toHaveLength(2);
    expect(state.updates[0]).toHaveProperty(
      "payment_reconciliation_checked_at",
    );
  });

  it("weist Aufrufe ohne korrektes Cron-Secret ab", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(state.reconcile).not.toHaveBeenCalled();
  });
});
