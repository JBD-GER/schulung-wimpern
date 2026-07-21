// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestSubject: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: state.insert }),
  }),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: state.enforceRateLimit,
  requestSubject: state.requestSubject,
}));

import { POST } from "@/app/api/privacy/consent/route";

describe("POST /api/privacy/consent", () => {
  beforeEach(() => {
    state.insert.mockReset().mockResolvedValue({ error: null });
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.requestSubject.mockReset().mockReturnValue("198.51.100.24");
    process.env.NEXT_PUBLIC_COOKIE_CONSENT_VERSION = "cookies-2026-07-21";
  });

  it("protokolliert die Auswahl und setzt getrennte Präferenz-/Nachweis-Cookies", async () => {
    const response = await POST(
      new Request("https://example.de/api/privacy/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.de",
        },
        body: JSON.stringify({
          version: "cookies-2026-07-21",
          analytics: true,
          marketing: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(state.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        consent_type: "website_analytics",
        consent_version: "cookies-2026-07-21",
        granted: true,
      }),
    );
    expect(state.enforceRateLimit).toHaveBeenCalledWith({
      bucket: "privacy-consent",
      subject: "198.51.100.24",
      maximum: 30,
      windowSeconds: 3600,
    });
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("swv_consent=");
    expect(cookies).toContain("swv_consent_id=");
    expect(cookies).toContain("HttpOnly");
  });

  it("startet bei einer veralteten Textversion keine Analyse", async () => {
    const response = await POST(
      new Request("https://example.de/api/privacy/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.de",
        },
        body: JSON.stringify({
          version: "cookies-alt",
          analytics: true,
          marketing: false,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(state.insert).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
