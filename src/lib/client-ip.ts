import { isIP } from "node:net";

const trustedHeaderBySource = {
  cloudflare: "cf-connecting-ip",
  vercel: "x-vercel-forwarded-for",
} as const;

export function trustedClientIp(request: Request): string | null {
  const source = process.env.TRUSTED_CLIENT_IP_SOURCE?.trim().toLowerCase();
  if (source !== "cloudflare" && source !== "vercel") return null;

  const value = request.headers
    .get(trustedHeaderBySource[source])
    ?.trim()
    .toLowerCase();
  if (!value || value.includes(",") || isIP(value) === 0) return null;
  return value;
}
