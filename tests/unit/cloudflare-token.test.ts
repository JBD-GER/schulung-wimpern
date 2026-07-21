// @vitest-environment node
import { Buffer } from "node:buffer";
import {
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createStreamToken,
  streamAllowedOrigins,
  streamPlaybackUrl,
} from "@/lib/server/cloudflare";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let publicKey: Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

afterEach(() => {
  delete process.env.CLOUDFLARE_STREAM_SIGNING_KEY;
  delete process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID;
  delete process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("Cloudflare-Stream-Wiedergabe", () => {
  it("verwendet den kundenspezifischen Wiedergabe-Host", () => {
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = "example123";

    expect(streamPlaybackUrl("signed-token")).toBe(
      "https://customer-example123.cloudflarestream.com/signed-token/iframe",
    );
  });

  it("fällt bei einem stehen gebliebenen Platzhalter auf den Standard-Host zurück", () => {
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = "YOUR_CUSTOMER_CODE";

    expect(streamPlaybackUrl("signed-token")).toBe(
      "https://iframe.videodelivery.net/signed-token",
    );
  });

  it("erlaubt lokal zusätzlich die beiden Entwicklungs-Hosts", () => {
    process.env.NEXT_PUBLIC_SITE_URL =
      "https://www.schulung-wimpernverlaengerung.de";

    expect(streamAllowedOrigins()).toEqual([
      "www.schulung-wimpernverlaengerung.de",
      "localhost:3000",
      "127.0.0.1:3000",
    ]);
  });
});

describe("Cloudflare-Stream-Signing-Key", () => {
  it("dekodiert den von Cloudflare gelieferten Base64-JWK und setzt kid in Header und Payload", async () => {
    const keyId = "cloudflare-key-jwk";
    const jwk = { ...(await exportJWK(privateKey)), kid: keyId };
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY = Buffer.from(
      JSON.stringify(jwk),
      "utf8",
    ).toString("base64");

    const token = await createStreamToken(
      "private-video-uid",
      new Date(Date.now() + 60 * 60 * 1000),
    );
    await expect(
      jwtVerify(token, publicKey, { algorithms: ["RS256"] }),
    ).resolves.toBeDefined();
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: "RS256",
      kid: keyId,
    });
    expect(decodeJwt(token)).toMatchObject({
      sub: "private-video-uid",
      kid: keyId,
    });
  });

  it("dekodiert alternativ einen Base64-PKCS8-PEM mit separater Key-ID", async () => {
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY = Buffer.from(
      await exportPKCS8(privateKey),
      "utf8",
    ).toString("base64");
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID = "cloudflare-key-pem";

    const token = await createStreamToken(
      "private-video-uid",
      new Date(Date.now() + 60 * 60 * 1000),
    );
    await expect(
      jwtVerify(token, publicKey, { algorithms: ["RS256"] }),
    ).resolves.toBeDefined();
    expect(decodeJwt(token).kid).toBe("cloudflare-key-pem");
  });
});
