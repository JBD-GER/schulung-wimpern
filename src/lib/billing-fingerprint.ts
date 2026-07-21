import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function normalizeTaxId(value: string): string {
  return value.replace(/[\s.-]/g, "").toUpperCase();
}

export function createBillingFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function readBillingFingerprint(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const value = (snapshot as Record<string, unknown>).billingFingerprint;
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
    ? value
    : null;
}
