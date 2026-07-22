// @vitest-environment node
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  sendEnrollment: vi.fn(),
  rpc: vi.fn(),
}));

const confirmationText = "Vertragsbestätigung\n" + "A".repeat(1800);
const confirmationHash = createHash("sha256")
  .update(confirmationText, "utf8")
  .digest("hex");

const provisionedIntent = {
  id: "40000000-0000-4000-8000-000000000001",
  auth_user_id: "20000000-0000-4000-8000-000000000001",
  provisioned_order_id: "50000000-0000-4000-8000-000000000001",
  first_name: "Erika",
  email: "erika@example.de",
  password_set_at: "2026-07-22T12:00:00.000Z",
  status: "provisioned",
  amount_total: 14900,
  currency: "eur",
  tax_amount: 2379,
  paid_at: "2026-07-22T11:59:00.000Z",
  billing_snapshot: { productName: "Schulung Wimpernverlängerung" },
  contract_confirmation_text: confirmationText,
  contract_confirmation_sha256: confirmationHash,
};

function queryBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.maybeSingle = async () => result;
  return builder;
}

const admin = vi.hoisted(() => ({
  rpc: state.rpc,
  from: vi.fn((table: string) => {
    if (table !== "checkout_intents") {
      throw new Error(`Unexpected table in outbox test: ${table}`);
    }
    return {
      select: vi.fn(() =>
        queryBuilder({ data: provisionedIntent, error: null }),
      ),
    };
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/server/email", () => ({
  sendEnrollmentActivatedEmail: state.sendEnrollment,
}));

import { provisionPaidCheckoutIntent } from "@/lib/server/checkout-intent";

describe("Provisionierungs-Outbox", () => {
  beforeEach(() => {
    state.rpc.mockReset().mockResolvedValue({ data: false, error: null });
    state.sendEnrollment.mockReset().mockResolvedValue(false);
    admin.from.mockClear();
  });

  it("bestätigt die atomare Freischaltung auch bei vorübergehendem E-Mail-Ausfall", async () => {
    const result = await provisionPaidCheckoutIntent(provisionedIntent.id);

    expect(result).toEqual({
      userId: provisionedIntent.auth_user_id,
      orderId: provisionedIntent.provisioned_order_id,
      accessGranted: false,
    });
    expect(state.sendEnrollment).toHaveBeenCalledOnce();
    expect(state.sendEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: provisionedIntent.auth_user_id,
        orderId: provisionedIntent.provisioned_order_id,
        contractConfirmation: expect.objectContaining({
          text: confirmationText,
          sha256: confirmationHash,
        }),
      }),
    );
  });

  it("lässt auch einen Provider-Fehler die bereits committed Freischaltung nicht zurückrollen", async () => {
    state.sendEnrollment.mockRejectedValue(new Error("Resend unavailable"));

    await expect(
      provisionPaidCheckoutIntent(provisionedIntent.id),
    ).resolves.toMatchObject({
      userId: provisionedIntent.auth_user_id,
      orderId: provisionedIntent.provisioned_order_id,
    });
  });
});
