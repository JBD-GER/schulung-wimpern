// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { trustedClientIp } from "@/lib/client-ip";

afterEach(() => vi.unstubAllEnvs());

describe("vertrauenswürdige Client-IP", () => {
  it("ignoriert frei gesetzte Forwarding-Header ohne Ingress-Vertrag", () => {
    const request = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "198.51.100.23",
        "x-real-ip": "198.51.100.24",
        "cf-connecting-ip": "198.51.100.25",
      },
    });
    expect(trustedClientIp(request)).toBeNull();
  });

  it("liest ausschließlich den ausgewählten Vercel-Header", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_SOURCE", "vercel");
    const request = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "198.51.100.23",
        "x-vercel-forwarded-for": "2001:db8::1",
      },
    });
    expect(trustedClientIp(request)).toBe("2001:db8::1");
  });

  it("weist Listen und syntaktisch ungültige Provider-Werte zurück", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_SOURCE", "cloudflare");
    expect(
      trustedClientIp(
        new Request("https://example.test", {
          headers: { "cf-connecting-ip": "198.51.100.2, 198.51.100.3" },
        }),
      ),
    ).toBeNull();
    expect(
      trustedClientIp(
        new Request("https://example.test", {
          headers: { "cf-connecting-ip": "not-an-ip" },
        }),
      ),
    ).toBeNull();
  });
});
