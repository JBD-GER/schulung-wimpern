import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertApprovedLegalTextHash } from "../../next.config";

describe("Rechtstext-Fingerabdruck", () => {
  const files = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "scripts/legal-text-files.json"),
      "utf8",
    ),
  ) as string[];

  it("erfasst verbindliche Textquellen, aber keine technische Checkout-Oberfläche", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "src/data/access-policy.ts",
        "src/data/checkout-legal.ts",
        "src/app/impressum/page.tsx",
        "src/app/datenschutz/page.tsx",
        "src/app/agb/page.tsx",
      ]),
    );
    expect(files).not.toEqual(
      expect.arrayContaining([
        "src/app/checkout/page.tsx",
        "src/components/checkout/checkout-flow.tsx",
        "src/components/privacy/consent-manager.tsx",
        "src/app/api/privacy/consent/route.ts",
      ]),
    );
  });

  it("stoppt einen freigegebenen Produktions-Build mit veraltetem Hash", () => {
    expect(() =>
      assertApprovedLegalTextHash({
        nodeEnvironment: "production",
        approvalFlag: "true",
        approvedHash: `sha256-${"a".repeat(64)}`,
        currentHash: `sha256-${"b".repeat(64)}`,
      }),
    ).toThrow(/Production build blocked/);
  });

  it("erlaubt den exakt freigegebenen Produktionsstand", () => {
    const hash = `sha256-${"a".repeat(64)}`;
    expect(() =>
      assertApprovedLegalTextHash({
        nodeEnvironment: "production",
        approvalFlag: "true",
        approvedHash: hash,
        currentHash: hash,
      }),
    ).not.toThrow();
  });

  it("blockiert Entwurfs- und Entwicklungsarbeit nicht", () => {
    expect(() =>
      assertApprovedLegalTextHash({
        nodeEnvironment: "development",
        approvalFlag: "true",
        approvedHash: "stale",
        currentHash: "current",
      }),
    ).not.toThrow();
    expect(() =>
      assertApprovedLegalTextHash({
        nodeEnvironment: "production",
        approvalFlag: "false",
        approvedHash: "stale",
        currentHash: "current",
      }),
    ).not.toThrow();
  });
});
