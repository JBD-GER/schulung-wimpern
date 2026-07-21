// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const billingFingerprint = "a".repeat(64);

const state = vi.hoisted(() => ({
  invoice: {} as Record<string, unknown>,
  retrieveInvoice: vi.fn(),
}));

function terminal<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  builder.then = (
    resolve: (value: T) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const order = {
  id: "order-1",
  course_id: "course-1",
  stripe_customer_id: "cus_test_1",
  stripe_invoice_id: "in_test_1",
  stripe_price_id: "price_test",
  amount_total: 14900,
  currency: "eur",
  payment_status: "paid",
  payment_source: "stripe",
  billing_snapshot: {
    billingFingerprint,
    productName: "Online-Schulung Wimpernverlängerung",
  },
  created_at: "2026-07-21T10:00:00.000Z",
  paid_at: "2026-07-21T10:01:00.000Z",
};

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn(() =>
          terminal({
            data: {
              first_name: "Erika",
              last_name: "Musterfrau",
              email: "erika@example.de",
            },
            error: null,
          }),
        ),
      };
    }
    if (table === "orders") {
      return {
        select: vi.fn(() => terminal({ data: [order], error: null })),
      };
    }
    if (table === "courses") {
      return {
        select: vi.fn(() =>
          terminal({
            data: { title: "Online-Schulung Wimpernverlängerung" },
            error: null,
          }),
        ),
      };
    }
    throw new Error(`Unexpected table in profile invoice test: ${table}`);
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/server/auth", () => ({
  requireUser: async () => ({ id: "user-1" }),
  requireAdmin: vi.fn(),
  isAdminUser: vi.fn(),
}));
vi.mock("@/lib/server/stripe", () => ({
  getStripe: () => ({
    invoices: { retrieve: state.retrieveInvoice },
  }),
}));

import { getProfileData } from "@/lib/server/queries";

describe("Rechnungsanzeige im Profil", () => {
  beforeEach(() => {
    state.invoice = {
      id: "in_test_1",
      status: "paid",
      number: "RE-2026-0001",
      customer: "cus_test_1",
      amount_paid: 14900,
      amount_remaining: 0,
      total: 14900,
      currency: "eur",
      invoice_pdf: "https://pay.stripe.com/invoice/test/pdf",
      hosted_invoice_url: "https://invoice.stripe.com/i/test",
      metadata: {
        order_id: "order-1",
        user_id: "user-1",
        course_id: "course-1",
        price_id: "price_test",
        billing_fingerprint: billingFingerprint,
      },
    };
    state.retrieveInvoice
      .mockReset()
      .mockImplementation(async () => state.invoice);
  });

  it("zeigt Nummer und PDF nur für die vollständig passende bezahlte Rechnung", async () => {
    const result = await getProfileData();

    expect(state.retrieveInvoice).toHaveBeenCalledWith("in_test_1");
    expect(result.orders[0]).toMatchObject({
      invoiceNumber: "RE-2026-0001",
      invoiceUrl: "https://pay.stripe.com/invoice/test/pdf",
    });
  });

  it("blendet den Link bei abweichendem Customer fail-closed aus", async () => {
    state.invoice = { ...state.invoice, customer: "cus_other" };

    const result = await getProfileData();

    expect(result.orders[0]).toMatchObject({
      invoiceNumber: null,
      invoiceUrl: null,
    });
  });

  it("blendet den Link bei abweichendem Rechnungsfingerabdruck aus", async () => {
    state.invoice = {
      ...state.invoice,
      metadata: {
        ...(state.invoice.metadata as Record<string, unknown>),
        billing_fingerprint: "b".repeat(64),
      },
    };

    const result = await getProfileData();

    expect(result.orders[0]).toMatchObject({
      invoiceNumber: null,
      invoiceUrl: null,
    });
  });
});
