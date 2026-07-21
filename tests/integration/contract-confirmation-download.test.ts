// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  filters: [] as Array<[string, unknown]>,
  queryResult: { data: null, error: null } as {
    data: Record<string, unknown> | null;
    error: unknown;
  },
}));

vi.mock("@/lib/server/auth", () => ({ requireUser: state.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: state.from }),
}));

import { GET } from "@/app/api/orders/[orderId]/contract-confirmation/route";
import { HttpError } from "@/lib/server/http";

const userId = "20000000-0000-4000-8000-000000000001";
const orderId = "f77cf5e7-77b9-4fa2-b620-31455c1965c5";
const confirmationText =
  "Unveränderliche Vertragsbestätigung für Änne Mustermann\n\nAGB und Widerrufsbelehrung.";
const confirmationSha256 = createHash("sha256")
  .update(confirmationText, "utf8")
  .digest("hex");

function requestOrder(id = orderId) {
  return GET(
    new Request(
      `https://www.schulung-wimpernverlaengerung.de/api/orders/${id}/contract-confirmation`,
    ),
    { params: Promise.resolve({ orderId: id }) },
  );
}

describe("Download der eingefrorenen Vertragsbestätigung", () => {
  beforeEach(() => {
    state.filters.length = 0;
    state.requireUser.mockReset().mockResolvedValue({ id: userId });
    state.queryResult = {
      data: {
        auth_user_id: userId,
        provisioned_order_id: orderId,
        status: "provisioned",
        contract_confirmation_text: confirmationText,
        contract_confirmation_sha256: confirmationSha256,
      },
      error: null,
    };
    state.from.mockReset().mockImplementation((table: string) => {
      expect(table).toBe("checkout_intents");
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          state.filters.push([column, value]);
          return builder;
        }),
        maybeSingle: vi.fn(async () => state.queryResult),
      };
      return builder;
    });
  });

  it("liefert nur den eigenen provisionierten Text bytegenau und ungecacht aus", async () => {
    const response = await requestOrder();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="vertragsbestaetigung-${orderId}.txt"`,
    );
    expect(await response.text()).toBe(confirmationText);
    expect(state.filters).toEqual([
      ["provisioned_order_id", orderId],
      ["auth_user_id", userId],
      ["status", "provisioned"],
    ]);
  });

  it("weist fremde oder nicht provisionierte Bestellungen ohne Preisgabe zurück", async () => {
    state.queryResult = { data: null, error: null };

    const response = await requestOrder();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "not_found",
    });
  });

  it("verweigert manipulierte gespeicherte Bytes", async () => {
    state.queryResult.data = {
      ...state.queryResult.data,
      contract_confirmation_sha256: "0".repeat(64),
    };

    const response = await requestOrder();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "integrity_error",
    });
  });

  it("validiert die UUID vor jedem Datenbankzugriff", async () => {
    const response = await requestOrder("keine-uuid");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_order_id",
    });
    expect(state.from).not.toHaveBeenCalled();
  });

  it("verlangt vor allen Bestellprüfungen eine gültige Anmeldung", async () => {
    state.requireUser.mockRejectedValueOnce(
      new HttpError(401, "Bitte melde dich an.", "authentication_required"),
    );

    const response = await requestOrder();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "authentication_required",
    });
    expect(state.from).not.toHaveBeenCalled();
  });
});
