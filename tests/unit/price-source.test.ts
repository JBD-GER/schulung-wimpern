// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("einheitliche Stripe-Preisquelle", () => {
  it("enthält in den Kaufoberflächen keinen hartcodierten Eurobetrag", () => {
    const files = [
      "src/app/page.tsx",
      "src/app/checkout/page.tsx",
      "src/components/checkout/checkout-flow.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/(?:€\s*\d|\d[\d.,]*\s*€)/);
    }
  });

  it("zeigt den autoritativen Stripe-Produktnamen und bewahrt ihn je Bestellung", () => {
    const checkout = readFileSync(
      resolve(process.cwd(), "src/app/checkout/page.tsx"),
      "utf8",
    );
    const queries = readFileSync(
      resolve(process.cwd(), "src/lib/server/queries.ts"),
      "utf8",
    );
    expect(checkout).toContain("product.name || COURSE.productName");
    expect(queries).toMatch(/orders[\s\S]*billing_snapshot[\s\S]*productName/);
  });
});
