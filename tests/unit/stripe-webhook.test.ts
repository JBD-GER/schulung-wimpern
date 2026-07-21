// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  event: null as Record<string, unknown> | null,
  webhookRecord: null as null | {
    id: string;
    status: string;
    payload_hash: string;
    received_at: string;
  },
  tables: [] as string[],
  rpc: vi.fn(),
  sendEnrollment: vi.fn(),
  retrieve: vi.fn(),
  retrievePaymentIntent: vi.fn(),
}));

const billingFingerprint = "a".repeat(64);

function terminal<T>(result: T, effect?: () => void) {
  let applied = false;
  const apply = () => {
    if (!applied) {
      applied = true;
      effect?.();
    }
  };
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "gte", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => {
    apply();
    return result;
  };
  builder.single = async () => {
    apply();
    return result;
  };
  builder.then = (
    resolve: (value: T) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    apply();
    return Promise.resolve(result).then(resolve, reject);
  };
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    state.tables.push(table);
    if (table === "webhook_events") {
      return {
        insert: vi.fn(async (value: { payload_hash: string }) => {
          if (state.webhookRecord) return { error: { code: "23505" } };
          state.webhookRecord = {
            id: "webhook-row",
            status: "processing",
            payload_hash: value.payload_hash,
            received_at: new Date().toISOString(),
          };
          return { error: null };
        }),
        select: vi.fn(() =>
          terminal({ data: state.webhookRecord, error: null }),
        ),
        update: vi.fn((values: { status?: string }) =>
          terminal({ error: null }, () => {
            if (state.webhookRecord && values.status) {
              state.webhookRecord.status = values.status;
            }
          }),
        ),
      };
    }
    if (table === "orders") {
      return {
        select: vi.fn(() =>
          terminal({
            data: {
              id: "order-1",
              user_id: "user-1",
              course_id: "course-1",
              stripe_customer_id: "cus_test_1",
              stripe_price_id: "price_test",
              stripe_payment_intent_id: null,
              amount_total: null,
              payment_status: "pending",
              payment_source: "stripe",
              billing_snapshot: { billingFingerprint },
            },
            error: null,
          }),
        ),
        update: vi.fn(() => terminal({ error: null })),
      };
    }
    if (table === "stripe_customers") {
      return { upsert: vi.fn(async () => ({ error: null })) };
    }
    if (table === "profiles") {
      return {
        select: vi.fn(() =>
          terminal({
            data: { first_name: "Erika", email: "erika@example.de" },
            error: null,
          }),
        ),
      };
    }
    if (table === "audit_logs") {
      return { insert: vi.fn(async () => ({ error: null })) };
    }
    throw new Error(`Unexpected table in webhook test: ${table}`);
  }),
  rpc: state.rpc,
}));

vi.mock("@/lib/env", () => ({
  requireEnv: (name: string) => {
    if (name === "STRIPE_PRICE_ID") return "price_test";
    if (name === "STRIPE_WEBHOOK_SECRET") return "whsec_test";
    throw new Error(`Unexpected env: ${name}`);
  },
  optionalEnv: () => undefined,
  getAdminEmails: () => new Set<string>(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/server/email", () => ({
  sendEnrollmentActivatedEmail: state.sendEnrollment,
  sendTransactionalEmail: vi.fn(),
}));
vi.mock("@/lib/server/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (_body: string, signature: string) => {
        if (signature !== "valid-signature") throw new Error("invalid");
        return state.event;
      },
    },
    checkout: { sessions: { retrieve: state.retrieve } },
    paymentIntents: { retrieve: state.retrievePaymentIntent },
  }),
}));

import { processStripeWebhook } from "@/lib/server/stripe-webhook";

const paidEvent = {
  id: "evt_paid_1",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1" } },
};

describe("Stripe-Webhook-Verarbeitung", () => {
  beforeEach(() => {
    state.event = structuredClone(paidEvent);
    state.webhookRecord = null;
    state.tables.length = 0;
    state.rpc.mockReset().mockResolvedValue({
      data: { order_id: "order-1", access_granted: true },
      error: null,
    });
    state.sendEnrollment.mockReset().mockResolvedValue(true);
    state.retrieve.mockReset().mockResolvedValue({
      id: "cs_test_1",
      payment_status: "paid",
      metadata: {
        user_id: "user-1",
        course_id: "course-1",
        order_id: "order-1",
        price_id: "price_test",
        billing_fingerprint: billingFingerprint,
      },
      line_items: { data: [{ price: { id: "price_test" }, quantity: 1 }] },
      payment_intent: "pi_test_1",
      customer: "cus_test_1",
      invoice: "in_test_1",
      amount_total: 34900,
      currency: "eur",
      total_details: { amount_tax: 5571 },
    });
    state.retrievePaymentIntent.mockReset().mockResolvedValue({
      id: "pi_test_1",
      amount: 34900,
      metadata: {
        user_id: "user-1",
        course_id: "course-1",
        order_id: "order-1",
        price_id: "price_test",
        billing_fingerprint: billingFingerprint,
      },
    });
  });

  it("weist eine ungültige Stripe-Signatur vor jedem Datenbankzugriff ab", async () => {
    await expect(processStripeWebhook("{}", "invalid")).rejects.toMatchObject({
      status: 400,
      code: "invalid_signature",
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("aktiviert und benachrichtigt bei einem bezahlten Ereignis genau einmal", async () => {
    await processStripeWebhook(JSON.stringify(paidEvent), "valid-signature");
    await processStripeWebhook(JSON.stringify(paidEvent), "valid-signature");

    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith(
      "fulfill_stripe_order",
      expect.objectContaining({
        paid_user_id: "user-1",
        paid_course_id: "course-1",
        price_id: "price_test",
        total_amount: 34900,
        currency_code: "eur",
      }),
    );
    expect(state.sendEnrollment).toHaveBeenCalledTimes(1);
    expect(state.webhookRecord?.status).toBe("processed");
  });

  it("erteilt bei einer fehlgeschlagenen Zahlung weder Enrollment noch Aktivierungsmail", async () => {
    state.event = {
      id: "evt_failed_1",
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: "cs_failed_1",
          metadata: {
            user_id: "user-1",
            course_id: "course-1",
            order_id: "order-1",
            price_id: "price_test",
            billing_fingerprint: billingFingerprint,
          },
        },
      },
    };
    await processStripeWebhook("failed-event", "valid-signature");

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.sendEnrollment).not.toHaveBeenCalled();
    expect(state.tables).not.toContain("enrollments");
    expect(state.webhookRecord?.status).toBe("processed");
  });

  it("verwirft einen bezahlten Checkout mit abweichendem Rechnungsfingerabdruck", async () => {
    state.retrieve.mockResolvedValueOnce({
      id: "cs_test_1",
      payment_status: "paid",
      metadata: {
        user_id: "user-1",
        course_id: "course-1",
        order_id: "order-1",
        price_id: "price_test",
        billing_fingerprint: "b".repeat(64),
      },
      line_items: { data: [{ price: { id: "price_test" }, quantity: 1 }] },
      payment_intent: "pi_test_1",
      amount_total: 34900,
      currency: "eur",
      total_details: { amount_tax: 5571 },
    });

    await expect(
      processStripeWebhook(JSON.stringify(paidEvent), "valid-signature"),
    ).rejects.toMatchObject({
      status: 400,
      code: "billing_fingerprint_mismatch",
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.sendEnrollment).not.toHaveBeenCalled();
  });

  it("bindet eine vollständige Rückzahlung vor dem Success-Webhook über PaymentIntent-Metadaten", async () => {
    state.event = {
      id: "evt_refund_1",
      type: "charge.refunded",
      data: {
        object: {
          refunded: true,
          payment_intent: "pi_test_1",
          amount_refunded: 34900,
        },
      },
    };
    state.rpc.mockResolvedValueOnce({ data: "order-1", error: null });

    await processStripeWebhook("refund-event", "valid-signature");

    expect(state.retrievePaymentIntent).toHaveBeenCalledWith("pi_test_1");
    expect(state.rpc).toHaveBeenCalledWith(
      "bind_and_revoke_stripe_order",
      expect.objectContaining({
        target_order_id: "order-1",
        expected_user_id: "user-1",
        expected_course_id: "course-1",
        expected_price_id: "price_test",
        expected_billing_fingerprint: billingFingerprint,
        expected_total_amount: 34900,
      }),
    );
    expect(state.sendEnrollment).not.toHaveBeenCalled();
  });

  it("widerruft bei einer Teilrückzahlung den Kurszugang noch nicht", async () => {
    state.event = {
      id: "evt_partial_refund_1",
      type: "charge.refunded",
      data: {
        object: {
          refunded: true,
          payment_intent: "pi_test_1",
          amount_refunded: 10000,
        },
      },
    };

    await processStripeWebhook("partial-refund-event", "valid-signature");

    expect(state.retrievePaymentIntent).toHaveBeenCalledWith("pi_test_1");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.webhookRecord?.status).toBe("processed");
  });
});
