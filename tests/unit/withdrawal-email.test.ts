// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  providerSend: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: state.providerSend };
  },
}));
vi.mock("@/lib/env", () => ({
  getSiteUrl: () => "https://www.schulung-wimpernverlaengerung.de",
  optionalEnv: (name: string) =>
    name === "SUPPORT_EMAIL" ? "support@example.de" : undefined,
  requireEnv: (name: string) =>
    name === "EMAIL_FROM" ? "Schulung <mail@example.de>" : "provider-key",
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: state.rpc,
    from: () => ({ update: state.update }),
  }),
}));

import { sendWithdrawalReceivedEmail } from "@/lib/server/email";

describe("E-Mail-Eingangsbestätigung zum Widerruf", () => {
  beforeEach(() => {
    state.rpc.mockReset().mockResolvedValue({
      data: {
        delivery_id: "6c781eee-d58d-4612-ab21-56a29743b255",
        claimed: true,
        delivery_status: "sending",
      },
      error: null,
    });
    state.providerSend.mockReset().mockResolvedValue({
      data: { id: "resend-message-1" },
      error: null,
    });
    state.eq.mockReset().mockResolvedValue({ error: null });
    state.update.mockReset().mockReturnValue({ eq: state.eq });
  });

  it("enthält Inhalt, Vertragsbezug sowie lokale und UTC-Eingangszeit", async () => {
    const sent = await sendWithdrawalReceivedEmail({
      withdrawalId: "8a2506f7-b912-47f1-b10c-29e410dd8975",
      receiptNumber: "WR-20260721-8A2506F7B912",
      consumerName: "Erika <Mustermann>",
      contractReference: "Rechnung R-2026-123",
      confirmationEmail: "erika@example.de",
      declarationText:
        "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag.",
      receivedAt: "2026-07-21T12:34:56.789Z",
    });

    expect(sent).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("claim_email_delivery", {
      delivery_user_id: null,
      delivery_recipient: "erika@example.de",
      delivery_template: "electronic_withdrawal_received",
      delivery_event_key:
        "electronic-withdrawal-received:8a2506f7-b912-47f1-b10c-29e410dd8975",
    });
    const [message, providerOptions] = state.providerSend.mock.calls[0] as [
      Record<string, string>,
      { idempotencyKey: string },
    ];
    expect(message.to).toBe("erika@example.de");
    expect(message.subject).toBe("Eingangsbestätigung deines Widerrufs");
    expect(message.html).toContain("WR-20260721-8A2506F7B912");
    expect(message.html).toContain("Rechnung R-2026-123");
    expect(message.html).toContain("2026-07-21T12:34:56.789Z");
    expect(message.html).toContain("Hiermit widerrufe ich");
    expect(message.html).toContain("Erika &lt;Mustermann&gt;");
    expect(message.html).not.toContain("Erika <Mustermann>");
    expect(message.text).toContain("Datum und Uhrzeit des Eingangs");
    expect(message.text).toContain("UTC: 2026-07-21T12:34:56.789Z");
    expect(providerOptions.idempotencyKey).toBe(
      "electronic-withdrawal-received:8a2506f7-b912-47f1-b10c-29e410dd8975",
    );
  });
});
