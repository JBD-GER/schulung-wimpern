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
  retrieveCharge: vi.fn(),
  retrieveInvoice: vi.fn(),
  retrievePaymentIntent: vi.fn(),
  orderUpdates: [] as Array<Record<string, unknown>>,
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
  for (const method of ["eq", "in", "is", "gte", "order", "limit", "select"]) {
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
              stripe_checkout_session_id: "cs_test_1",
              stripe_customer_id: "cus_test_1",
              stripe_price_id: "price_test",
              stripe_payment_intent_id: null,
              stripe_invoice_id: null,
              amount_total: null,
              currency: null,
              payment_status: "pending",
              payment_source: "stripe",
              billing_snapshot: { billingFingerprint },
            },
            error: null,
          }),
        ),
        update: vi.fn((values: Record<string, unknown>) =>
          terminal({ data: { id: "order-1" }, error: null }, () => {
            state.orderUpdates.push(values);
          }),
        ),
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
    charges: { retrieve: state.retrieveCharge },
    invoices: { retrieve: state.retrieveInvoice },
    paymentIntents: { retrieve: state.retrievePaymentIntent },
  }),
}));

import {
  REQUIRED_STRIPE_WEBHOOK_EVENTS,
  processStripeWebhook,
} from "@/lib/server/stripe-webhook";

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
    state.orderUpdates.length = 0;
    state.rpc.mockReset().mockResolvedValue({
      data: { order_id: "order-1", access_granted: true },
      error: null,
    });
    state.sendEnrollment.mockReset().mockResolvedValue(true);
    state.retrieve.mockReset().mockResolvedValue({
      id: "cs_test_1",
      status: "complete",
      payment_status: "paid",
      client_reference_id: "user-1",
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
      status: "succeeded",
      customer: "cus_test_1",
      currency: "eur",
      metadata: {
        user_id: "user-1",
        course_id: "course-1",
        order_id: "order-1",
        price_id: "price_test",
        billing_fingerprint: billingFingerprint,
      },
    });
    state.retrieveInvoice.mockReset().mockResolvedValue({
      id: "in_test_1",
      status: "paid",
      customer: "cus_test_1",
      amount_paid: 34900,
      amount_remaining: 0,
      total: 34900,
      currency: "eur",
      metadata: {
        user_id: "user-1",
        course_id: "course-1",
        order_id: "order-1",
        price_id: "price_test",
        billing_fingerprint: billingFingerprint,
      },
    });
    state.retrieveCharge.mockReset().mockResolvedValue({
      id: "ch_test_1",
      amount: 34900,
      amount_refunded: 34900,
      currency: "eur",
      payment_intent: "pi_test_1",
      refunded: true,
    });
  });

  it("definiert genau die für den neuen Stripe-Endpoint benötigten Ereignisse", () => {
    expect(REQUIRED_STRIPE_WEBHOOK_EVENTS).toEqual([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "invoice.paid",
      "refund.created",
      "refund.updated",
      "charge.dispute.created",
    ]);
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

  it("verknüpft eine später erzeugte Rechnung nur nach vollständigem Stripe-Abgleich", async () => {
    state.event = {
      id: "evt_invoice_paid_1",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_test_1",
          metadata: { order_id: "order-1" },
        },
      },
    };

    await processStripeWebhook("invoice-event", "valid-signature");

    expect(state.retrieveInvoice).toHaveBeenCalledWith("in_test_1");
    expect(state.retrieve).toHaveBeenCalledWith("cs_test_1", {
      expand: ["line_items.data.price"],
    });
    expect(state.retrievePaymentIntent).toHaveBeenCalledWith("pi_test_1");
    expect(state.orderUpdates).toContainEqual({
      stripe_invoice_id: "in_test_1",
    });
    expect(state.webhookRecord?.status).toBe("processed");
  });

  it("verknüpft keine Rechnung eines abweichenden Stripe Customers", async () => {
    state.event = {
      id: "evt_invoice_wrong_customer",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_test_1",
          metadata: { order_id: "order-1" },
        },
      },
    };
    state.retrieveInvoice.mockResolvedValueOnce({
      id: "in_test_1",
      status: "paid",
      customer: "cus_other",
      amount_paid: 34900,
      amount_remaining: 0,
      total: 34900,
      currency: "eur",
      metadata: {
        user_id: "user-1",
        course_id: "course-1",
        order_id: "order-1",
        price_id: "price_test",
        billing_fingerprint: billingFingerprint,
      },
    });

    await expect(
      processStripeWebhook("wrong-invoice-event", "valid-signature"),
    ).rejects.toMatchObject({
      status: 400,
      code: "invoice_payment_mismatch",
    });
    expect(state.orderUpdates).toEqual([]);
  });

  it("ignoriert bezahlte Rechnungen ohne App-Bestellreferenz", async () => {
    state.event = {
      id: "evt_unrelated_invoice",
      type: "invoice.paid",
      data: { object: { id: "in_unrelated", metadata: {} } },
    };

    await processStripeWebhook("unrelated-invoice", "valid-signature");

    expect(state.retrieveInvoice).not.toHaveBeenCalled();
    expect(state.orderUpdates).toEqual([]);
    expect(state.webhookRecord?.status).toBe("ignored");
  });

  it("wertet bei Refund-Events den kumulierten Charge-Betrag aus", async () => {
    state.event = {
      id: "evt_refund_created_1",
      type: "refund.created",
      data: {
        object: {
          id: "re_test_1",
          status: "succeeded",
          amount: 24900,
          currency: "eur",
          charge: "ch_test_1",
          payment_intent: "pi_test_1",
        },
      },
    };
    state.rpc.mockResolvedValueOnce({ data: "order-1", error: null });

    await processStripeWebhook("refund-created", "valid-signature");

    expect(state.retrieveCharge).toHaveBeenCalledWith("ch_test_1");
    expect(state.rpc).toHaveBeenCalledWith(
      "bind_and_revoke_stripe_order",
      expect.objectContaining({ expected_total_amount: 34900 }),
    );
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
