// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  signInWithPassword: vi.fn(),
  auditInsert: vi.fn(),
  profileUpdate: vi.fn(),
  profileUpdateResult: {} as {
    data: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  },
  historyCount: 0,
  confirmationCount: 0,
}));

function resultBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => result);
  builder.then = (
    resolve: (value: T) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn(() =>
          resultBuilder({
            data: {
              first_name: "Mira",
              last_name: "Muster",
              certificate_name: "Mira Zertifikat",
            },
            error: null,
          }),
        ),
        update: state.profileUpdate,
      };
    }
    if (table === "certificates") {
      return resultBuilder({
        data: null,
        error: null,
        count: state.historyCount,
      });
    }
    if (table === "certificate_issuance_confirmations") {
      return resultBuilder({
        data: null,
        error: null,
        count: state.confirmationCount,
      });
    }
    if (table === "audit_logs") {
      return { insert: state.auditInsert };
    }
    throw new Error(`Unerwartete Tabelle: ${table}`);
  }),
}));

vi.mock("@/lib/server/auth", () => ({ requireUser: state.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: state.signInWithPassword },
  })),
}));
vi.mock("@/lib/server/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { PATCH } from "@/app/api/account/update/route";

describe("Atomare Sperre der bestätigten Zertifikatsidentität", () => {
  beforeEach(() => {
    state.requireUser.mockReset().mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000001",
      email: "mira@example.de",
    });
    state.signInWithPassword.mockReset();
    state.auditInsert.mockReset();
    state.auditInsert.mockResolvedValue({ error: null });
    state.historyCount = 0;
    state.confirmationCount = 0;
    state.profileUpdateResult = {
      data: {
        first_name: "Maria",
        last_name: "Muster",
        certificate_name: "Mira Zertifikat",
        email: "mira@example.de",
      },
      error: null,
    };
    state.profileUpdate
      .mockReset()
      .mockImplementation(() => resultBuilder(state.profileUpdateResult));
    admin.from.mockClear();
  });

  it("erlaubt Vor- oder Nachnamensänderungen, wenn ein fixes certificate_name die Druckidentität beibehält", async () => {
    const response = await PATCH(
      new Request("http://localhost:3000/api/account/update", {
        method: "PATCH",
        headers: {
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Maria",
          lastName: "Muster",
          certificateName: "Mira Zertifikat",
          billingType: "private",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      profile: {
        first_name: "Maria",
        certificate_name: "Mira Zertifikat",
      },
    });
    expect(state.signInWithPassword).not.toHaveBeenCalled();
    expect(state.profileUpdate).toHaveBeenCalledOnce();
    expect(state.auditInsert).toHaveBeenCalledOnce();
  });

  it("übersetzt den konkurrierenden FK-Schutz bei geänderter Druckidentität in einen kontrollierten 409", async () => {
    state.signInWithPassword.mockResolvedValue({ error: null });
    state.profileUpdateResult = {
      data: null,
      error: {
        code: "23503",
        message:
          "profile identity version is still referenced by a confirmation",
      },
    };

    const response = await PATCH(
      new Request("http://localhost:3000/api/account/update", {
        method: "PATCH",
        headers: {
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Maria",
          lastName: "Muster",
          certificateName: "Maria Zertifikat",
          currentPassword: "richtiges-passwort",
          billingType: "private",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "certificate_reissue_required",
    });
    expect(state.signInWithPassword).toHaveBeenCalledOnce();
    expect(state.profileUpdate).toHaveBeenCalledOnce();
    expect(state.auditInsert).not.toHaveBeenCalled();
  });
});
