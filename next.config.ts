import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legalTextFiles = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/legal-text-files.json"), "utf8"),
) as string[];
const legalTextEnvironmentNames = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "scripts/legal-text-environment.json"),
    "utf8",
  ),
) as string[];

function currentLegalTextHash() {
  const digest = createHash("sha256");
  for (const file of legalTextFiles) {
    const normalized = readFileSync(
      resolve(process.cwd(), file),
      "utf8",
    ).replace(/\r\n/g, "\n");
    digest.update(file);
    digest.update("\0");
    digest.update(normalized);
    digest.update("\0");
  }
  for (const name of legalTextEnvironmentNames) {
    digest.update(name);
    digest.update("\0");
    digest.update(process.env[name]?.trim() ?? "");
    digest.update("\0");
  }
  return `sha256-${digest.digest("hex")}`;
}

export function assertApprovedLegalTextHash(input: {
  nodeEnvironment: string | undefined;
  approvalFlag: string | undefined;
  approvedHash: string | undefined;
  currentHash: string;
}) {
  const approvalRequested = ["1", "true", "yes", "on"].includes(
    input.approvalFlag?.trim().toLowerCase() ?? "",
  );
  if (
    input.nodeEnvironment === "production" &&
    approvalRequested &&
    input.approvedHash?.trim() !== input.currentHash
  ) {
    throw new Error(
      "Production build blocked: CHECKOUT_LEGAL_TEXT_HASH does not match the approved legal text content. Run `npm run legal:hash`, approve that exact version, update the deployment environment, and rebuild.",
    );
  }
}

const legalTextContentHash = currentLegalTextHash();
assertApprovedLegalTextHash({
  nodeEnvironment: process.env.NODE_ENV,
  approvalFlag: process.env.LEGAL_TEXTS_APPROVED,
  approvedHash: process.env.CHECKOUT_LEGAL_TEXT_HASH,
  currentHash: legalTextContentHash,
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Build-time fingerprint used by the server-side sale gate. It includes the
  // binding source files and concrete legal-provider environment values.
  env: { LEGAL_TEXT_CONTENT_HASH: legalTextContentHash },
  outputFileTracingIncludes: {
    "/*": ["./node_modules/dejavu-fonts-ttf/ttf/*.ttf"],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "schulung-wimpernverlaengerung.de",
          },
        ],
        destination: "https://www.schulung-wimpernverlaengerung.de/:path*",
        permanent: true,
      },
      { source: "/registrieren", destination: "/checkout", statusCode: 301 },
      { source: "/register", destination: "/checkout", statusCode: 301 },
      { source: "/anmelden", destination: "/login", statusCode: 301 },
      {
        source: "/online-kurs-wimpernverlaengerung",
        destination: "/#inhalte",
        statusCode: 301,
      },
      {
        source: "/wimpernverlangerung-schulung",
        destination: "/",
        statusCode: 301,
      },
    ];
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self' https://*.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://js.stripe.com https://embed.cloudflarestream.com https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.stripe.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://google.com https://www.google.de https://pagead2.googlesyndication.com",
      "font-src 'self' data:",
      `connect-src 'self'${isProduction ? "" : " ws://127.0.0.1:* ws://localhost:*"} https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.stripe.com https://embed.cloudflarestream.com https://*.cloudflarestream.com https://*.videodelivery.net https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://ad.doubleclick.net https://www.google.com https://google.com https://www.google.de https://pagead2.googlesyndication.com`,
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://*.videodelivery.net https://*.cloudflarestream.com https://www.googletagmanager.com",
      "media-src 'self' blob: https://*.videodelivery.net https://*.cloudflarestream.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ...(isProduction
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]
        : []),
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
