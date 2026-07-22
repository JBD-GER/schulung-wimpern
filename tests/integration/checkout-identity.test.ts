// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    email: string;
    email_confirmed_at: string;
  },
  existingUserId: null as string | null,
  existingEnrollment: null as null | { id: string },
  activeIntent: null as null | Record<string, unknown>,
  insertedIntent: null as null | Record<string, unknown>,
  hashPassword: vi.fn(async () => `$2b$12$${"a".repeat(53)}`),
  verifyPassword: vi.fn(async () => true),
  setCookie: vi.fn(),
  refreshCookie: vi.fn(),
}));

function queryBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "neq"]) builder[method] = () => builder;
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "courses") {
      return {
        select: vi.fn(() =>
          queryBuilder({
            data: {
              id: "40000000-0000-4000-8000-000000000001",
              version: "2026.1",
            },
            error: null,
          }),
        ),
      };
    }
    if (table === "enrollments") {
      return {
        select: vi.fn(() =>
          queryBuilder({
            data: state.existingEnrollment,
            error: null,
          }),
        ),
      };
    }
    if (table === "checkout_intents") {
      return {
        select: vi.fn(() =>
          queryBuilder({
            data: state.activeIntent,
            error: null,
          }),
        ),
        update: vi.fn(() => {
          const builder = queryBuilder({
            data: state.activeIntent ? { id: state.activeIntent.id } : null,
            error: null,
          });
          builder.select = () => builder;
          return builder;
        }),
        insert: vi.fn((value: Record<string, unknown>) => {
          state.insertedIntent = value;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "50000000-0000-4000-8000-000000000001" },
                error: null,
              })),
            })),
          };
        }),
      };
    }
    throw new Error(`Unexpected table in checkout identity test: ${table}`);
  }),
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: vi.fn(async () => state.user),
}));
vi.mock("@/lib/server/catalog", () => ({
  requireStripeProduct: vi.fn(async () => ({
    priceId: "price_course",
  })),
}));
vi.mock("@/lib/server/checkout-intent", () => ({
  checkoutIntentTtlSeconds: () => 3600,
  createCheckoutIntentToken: () => "b".repeat(43),
  hashCheckoutIntentToken: () => "c".repeat(64),
  readCheckoutIntentCookie: vi.fn(async () => null),
  refreshCheckoutIntentCookie: state.refreshCookie,
  resolveAuthUserByEmail: vi.fn(async () => state.existingUserId),
  setCheckoutIntentCookie: state.setCookie,
}));
vi.mock("@/lib/server/checkout-password", () => ({
  hashCheckoutPassword: state.hashPassword,
  verifyCheckoutPassword: state.verifyPassword,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  requestSubject: () => "test-browser",
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));

import { POST } from "@/app/api/checkout/intent/route";

const validPassword = "SicheresPasswort9!";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/checkout/intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Erika",
    lastName: "Mustermann",
    email: "erika@example.de",
    password: validPassword,
    ...overrides,
  };
}

describe("Checkout-Identität ohne Bestätigungs-E-Mail", () => {
  beforeEach(() => {
    state.user = null;
    state.existingUserId = null;
    state.existingEnrollment = null;
    state.activeIntent = null;
    state.insertedIntent = null;
    state.hashPassword.mockClear();
    state.verifyPassword.mockClear();
    state.setCookie.mockClear();
    state.refreshCookie.mockClear();
    admin.from.mockClear();
  });

  it("speichert für eine neue Adresse nur den Passwort-Hash und erstellt noch kein Auth-Konto", async () => {
    const response = await POST(request(identity()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(state.hashPassword).toHaveBeenCalledWith(validPassword);
    expect(state.insertedIntent).toMatchObject({
      auth_user_id: null,
      email: "erika@example.de",
      identity_mode: "new_account_password",
      signup_password_hash: `$2b$12$${"a".repeat(53)}`,
      email_verification_token_hash: null,
      email_verified_at: null,
      status: "ready",
    });
    expect(admin.from).not.toHaveBeenCalledWith("orders");
    expect(admin.from).not.toHaveBeenCalledWith("enrollments");
    expect(body).toMatchObject({ ready: true, accountMode: "new" });
    expect(JSON.stringify(body)).not.toContain(validPassword);
    expect(JSON.stringify(body)).not.toContain("$2b$");
    expect(state.setCookie).toHaveBeenCalledOnce();
  });

  it("blockiert eine vorhandene E-Mail anonym vor Passwort-Hash und Stripe", async () => {
    state.existingUserId = "20000000-0000-4000-8000-000000000001";

    const response = await POST(request(identity()));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("checkout_login_required");
    expect(state.hashPassword).not.toHaveBeenCalled();
    expect(state.insertedIntent).toBeNull();
    expect(state.setCookie).not.toHaveBeenCalled();
  });

  it("bindet ein passend angemeldetes Bestandskonto ohne neuen Passwort-Hash", async () => {
    const userId = "20000000-0000-4000-8000-000000000001";
    state.user = {
      id: userId,
      email: "erika@example.de",
      email_confirmed_at: "2026-07-22T08:00:00.000Z",
    };
    state.existingUserId = userId;

    const response = await POST(request(identity({ password: undefined })));

    expect(response.status).toBe(201);
    expect(state.hashPassword).not.toHaveBeenCalled();
    expect(state.insertedIntent).toMatchObject({
      auth_user_id: userId,
      identity_mode: "existing_authenticated",
      signup_password_hash: null,
      status: "ready",
    });
  });

  it("verlangt bei einer neuen Buchung ein starkes Passwort", async () => {
    const missing = await POST(request(identity({ password: undefined })));
    const weak = await POST(request(identity({ password: "zu-kurz" })));

    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("checkout_password_required");
    expect(weak.status).toBe(400);
    expect((await weak.json()).error).toBe("validation_error");
    expect(state.hashPassword).not.toHaveBeenCalled();
  });

  it("bindet einen offenen Checkout nach Cookieverlust nur mit demselben Passwort wieder", async () => {
    state.activeIntent = {
      id: "50000000-0000-4000-8000-000000000099",
      auth_user_id: null,
      course_id: "40000000-0000-4000-8000-000000000001",
      course_version: "2026.1",
      email: "erika@example.de",
      first_name: "Erika",
      last_name: "Mustermann",
      browser_token_hash: "d".repeat(64),
      identity_mode: "new_account_password",
      signup_password_hash: `$2b$12$${"z".repeat(53)}`,
      stripe_price_id: "price_course",
      stripe_checkout_session_id: "cs_test_existing",
      status: "open",
      paid_at: null,
      preparation_lease_expires_at: null,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    const response = await POST(request(identity()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ resumed: true, status: "open" });
    expect(state.verifyPassword).toHaveBeenCalledWith(
      validPassword,
      state.activeIntent.signup_password_hash,
    );
    expect(state.insertedIntent).toBeNull();
    expect(state.setCookie).toHaveBeenCalledWith(
      state.activeIntent.id,
      expect.any(String),
      expect.any(Date),
    );
  });
});
