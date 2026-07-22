import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
        "src/app/widerruf/page.tsx",
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
});
