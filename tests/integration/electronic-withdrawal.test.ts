// @vitest-environment node
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  requestSubject: vi.fn(),
  rpc: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  sendWithdrawalReceivedEmail: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: state.enforceRateLimit,
  requestSubject: state.requestSubject,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: state.getSupabaseAdmin,
}));
vi.mock("@/lib/server/email", () => ({
  sendWithdrawalReceivedEmail: state.sendWithdrawalReceivedEmail,
}));

import { POST } from "@/app/api/withdrawal/route";

const submissionId = "6f8c4e9a-1a85-4bd3-953f-a67240d808c1";
const recorded = {
  withdrawal_id: "8a2506f7-b912-47f1-b10c-29e410dd8975",
  receipt_number: "WR-20260721-8A2506F7B912",
  received_at: "2026-07-21T12:34:56.789Z",
  recorded_consumer_name: "Erika Mustermann",
  recorded_contract_reference: "Rechnung R-2026-123",
  recorded_confirmation_email: "erika@example.de",
  declaration_text:
    "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Online-Schulung Wimpernverlängerung.",
};

function request(
  body: unknown = {
    submissionId,
    consumerName: "  Erika   Mustermann ",
    contractReference: " Rechnung   R-2026-123 ",
    confirmationEmail: "ERIKA@EXAMPLE.DE",
    confirmation: "withdrawal_confirmed",
  },
  origin = "https://www.schulung-wimpernverlaengerung.de",
) {
  return new Request(
    "https://www.schulung-wimpernverlaengerung.de/api/withdrawal",
    {
      method: "POST",
      headers: {
        origin,
        "sec-fetch-site":
          origin === "https://www.schulung-wimpernverlaengerung.de"
            ? "same-origin"
            : "cross-site",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("elektronische Widerrufsfunktion", () => {
  beforeEach(() => {
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.requestSubject.mockReset().mockReturnValue("198.51.100.24");
    state.rpc.mockReset().mockResolvedValue({ data: [recorded], error: null });
    state.getSupabaseAdmin.mockReset().mockReturnValue({ rpc: state.rpc });
    state.sendWithdrawalReceivedEmail.mockReset().mockResolvedValue(true);
  });

  it("speichert erst nach finaler Bestätigung und versendet den exakten Beleg", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recorded: true,
      emailSent: true,
      receiptNumber: recorded.receipt_number,
      receivedAt: recorded.received_at,
    });
    expect(state.enforceRateLimit).toHaveBeenNthCalledWith(1, {
      bucket: "electronic-withdrawal-ip",
      subject: "198.51.100.24",
      maximum: 20,
      windowSeconds: 3600,
    });
    expect(state.enforceRateLimit).toHaveBeenNthCalledWith(2, {
      bucket: "electronic-withdrawal-email",
      subject: "erika@example.de",
      maximum: 5,
      windowSeconds: 3600,
    });
    expect(state.rpc).toHaveBeenCalledWith("record_electronic_withdrawal", {
      submitted_submission_key_hash: createHash("sha256")
        .update(submissionId, "utf8")
        .digest("hex"),
      submitted_consumer_name: "Erika Mustermann",
      submitted_contract_reference: "Rechnung R-2026-123",
      submitted_confirmation_email: "erika@example.de",
    });
    expect(state.sendWithdrawalReceivedEmail).toHaveBeenCalledWith({
      withdrawalId: recorded.withdrawal_id,
      receiptNumber: recorded.receipt_number,
      consumerName: recorded.recorded_consumer_name,
      contractReference: recorded.recorded_contract_reference,
      confirmationEmail: recorded.recorded_confirmation_email,
      declarationText: recorded.declaration_text,
      receivedAt: recorded.received_at,
    });
  });

  it("weist Cross-Site-Aufrufe vor Rate-Limit, Speicherung und E-Mail ab", async () => {
    const response = await POST(request(undefined, "https://evil.example"));

    expect(response.status).toBe(403);
    expect(state.enforceRateLimit).not.toHaveBeenCalled();
    expect(state.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(state.sendWithdrawalReceivedEmail).not.toHaveBeenCalled();
  });

  it.each([
    {
      submissionId,
      consumerName: "Erika Mustermann",
      contractReference: "R-123",
      confirmationEmail: "keine-mail",
      confirmation: "withdrawal_confirmed",
    },
    {
      submissionId,
      consumerName: "Erika Mustermann",
      contractReference: "R-123",
      confirmationEmail: "erika@example.de",
      confirmation: "nur_pruefen",
    },
  ])("lehnt ungültige oder unbestätigte Erklärungen ab", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(state.enforceRateLimit).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("wiederholt einen fehlgeschlagenen unmittelbaren Mailversand idempotent", async () => {
    state.sendWithdrawalReceivedEmail
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.sendWithdrawalReceivedEmail).toHaveBeenCalledTimes(2);
  });

  it("bestätigt den DB-Eingang ehrlich, wenn auch der zweite Mailversuch scheitert", async () => {
    state.sendWithdrawalReceivedEmail.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      recorded: true,
      emailSent: false,
      error: "withdrawal_confirmation_email_pending",
      receiptNumber: recorded.receipt_number,
    });
    expect(state.sendWithdrawalReceivedEmail).toHaveBeenCalledTimes(2);
  });
});
