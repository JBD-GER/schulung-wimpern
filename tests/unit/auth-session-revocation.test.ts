// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  registryData: null as null | { revoked_at: string | null },
  registryError: null as null | { message: string },
  registryReads: 0,
  session: null as null | Record<string, unknown>,
  user: { id: "user-1", email: "learner@example.de" },
}));

function queryResult() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => {
      state.registryReads += 1;
      return { data: state.registryData, error: state.registryError };
    },
  };
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn(() => queryResult()),
}));

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    getSession: vi.fn(async () => ({
      data: { session: state.session },
      error: null,
    })),
  },
}));

vi.mock("@/lib/env", () => ({
  getAdminEmails: () => new Set<string>(),
  optionalEnv: () => undefined,
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabase,
}));

import { getCurrentUser } from "@/lib/server/auth";

function unsignedJwt(claims: Record<string, unknown>): string {
  const encoded = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded({ alg: "none", typ: "JWT" })}.${encoded(claims)}.signature`;
}

describe("server-side auth session revocation", () => {
  beforeEach(() => {
    state.registryData = null;
    state.registryError = null;
    state.registryReads = 0;
    state.session = {
      access_token: unsignedJwt({ sub: "user-1", session_id: "session-123" }),
      user: state.user,
    };
    admin.from.mockClear();
  });

  it("accepts a verified, unrevoked observed session", async () => {
    state.registryData = { revoked_at: null };

    await expect(getCurrentUser()).resolves.toEqual(state.user);
    expect(admin.from).toHaveBeenCalledWith("auth_session_registry");
  });

  it("rejects a session immediately after it was logged out elsewhere", async () => {
    state.registryData = { revoked_at: "2026-07-21T08:00:00.000Z" };

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("allows a verified callback session that has not been observed yet", async () => {
    state.registryData = null;

    await expect(getCurrentUser()).resolves.toEqual(state.user);
  });

  it("fails closed if the revocation registry cannot be queried", async () => {
    state.registryError = { message: "database unavailable" };

    await expect(getCurrentUser()).rejects.toMatchObject({ status: 503 });
  });

  it("rejects a token that has no stable Supabase session id", async () => {
    state.session = {
      access_token: unsignedJwt({ sub: "user-1" }),
      user: state.user,
    };

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(state.registryReads).toBe(0);
  });
});
