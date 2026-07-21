import "server-only";

import { createPrivateKey } from "node:crypto";

import { importJWK, SignJWT, type JWK } from "jose";

import { getSiteUrl, optionalEnv, requireEnv } from "@/lib/env";

interface ParsedSigningKey {
  keyId: string;
  key: JWK | string;
}

type SigningKeyRecord = Record<string, unknown> & {
  id?: string;
  keyId?: string;
  kid?: string;
  pem?: unknown;
  privateKey?: unknown;
  jwk?: unknown;
  kty?: string;
  result?: unknown;
};

function jsonRecord(value: string): SigningKeyRecord | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as SigningKeyRecord)
      : null;
  } catch {
    return null;
  }
}

function decodedBase64(value: string): string | null {
  try {
    const decoded = Buffer.from(value.trim(), "base64").toString("utf8").trim();
    return decoded && decoded !== value.trim() ? decoded : null;
  } catch {
    return null;
  }
}

function resolveKey(value: unknown): JWK | string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as SigningKeyRecord;
    return typeof record.kty === "string" ? (record as JWK) : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim().replace(/\\n/g, "\n");
  if (/^-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(candidate)) return candidate;

  const directJson = jsonRecord(candidate);
  if (directJson) return resolveKey(directJson);
  const decoded = decodedBase64(candidate);
  if (!decoded) return null;
  if (/^-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(decoded)) return decoded;
  const decodedJson = jsonRecord(decoded);
  return decodedJson ? resolveKey(decodedJson) : null;
}

function parseSigningKey(): ParsedSigningKey {
  const raw = requireEnv("CLOUDFLARE_STREAM_SIGNING_KEY").trim();
  const decodedRaw = decodedBase64(raw);
  const parsedRoot =
    jsonRecord(raw) ?? (decodedRaw ? jsonRecord(decodedRaw) : null);
  const parsed =
    parsedRoot?.result &&
    typeof parsedRoot.result === "object" &&
    !Array.isArray(parsedRoot.result)
      ? (parsedRoot.result as SigningKeyRecord)
      : parsedRoot;
  const keySource = parsed
    ? (parsed.jwk ??
      parsed.pem ??
      parsed.privateKey ??
      (parsed.kty ? parsed : raw))
    : raw;
  const key = resolveKey(keySource);
  const keyId =
    parsed?.id ??
    parsed?.keyId ??
    parsed?.kid ??
    (key !== null && typeof key === "object" && typeof key.kid === "string"
      ? key.kid
      : undefined) ??
    optionalEnv("CLOUDFLARE_STREAM_SIGNING_KEY_ID");
  if (!keyId || !key) {
    throw new Error(
      "CLOUDFLARE_STREAM_SIGNING_KEY enthält keine nutzbare Key-ID oder keinen privaten PEM-/JWK-Schlüssel.",
    );
  }
  return { keyId, key };
}

export async function createStreamToken(
  videoUid: string,
  expiresAt: Date,
): Promise<string> {
  const { keyId, key } = parseSigningKey();
  const privateKey =
    typeof key === "string"
      ? createPrivateKey(key)
      : await importJWK(key, "RS256");
  return new SignJWT({ sub: videoUid, kid: keyId })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(privateKey);
}

export function streamPlaybackUrl(token: string): string {
  const configuredValue = optionalEnv("CLOUDFLARE_STREAM_CUSTOMER_CODE");
  const hostMatch = configuredValue?.match(
    /^(?:https:\/\/)?customer-([a-z0-9]+)\.cloudflarestream\.com\/?$/i,
  );
  const customerCode = hostMatch?.[1] ?? configuredValue;
  const usableCustomerCode =
    customerCode &&
    /^[a-z0-9]+$/i.test(customerCode) &&
    !/^your/i.test(customerCode)
      ? customerCode
      : null;
  return usableCustomerCode
    ? `https://customer-${usableCustomerCode}.cloudflarestream.com/${token}/iframe`
    : `https://iframe.videodelivery.net/${token}`;
}

export function streamAllowedOrigins(): string[] {
  const origins = new Set([new URL(getSiteUrl()).host]);

  if (process.env.NODE_ENV !== "production") {
    origins.add("localhost:3000");
    origins.add("127.0.0.1:3000");
  }

  return [...origins];
}

export async function secureStreamVideo(videoUid: string): Promise<void> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_STREAM_API_TOKEN");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/${encodeURIComponent(videoUid)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: videoUid,
        requireSignedURLs: true,
        allowedOrigins: streamAllowedOrigins(),
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: { uid?: string; requireSignedURLs?: boolean };
  } | null;
  if (
    !response.ok ||
    !payload?.success ||
    payload.result?.requireSignedURLs !== true
  ) {
    throw new Error(
      "Cloudflare Stream konnte nicht sicher konfiguriert werden.",
    );
  }
}
