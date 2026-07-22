import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PriceDisplay } from "@/components/marketing/price-display";

afterEach(cleanup);

describe("Öffentliche Preisanzeige", () => {
  it("zeigt den freigegebenen Preis auch bei einem vorübergehenden Katalogfehler", () => {
    render(
      <PriceDisplay
        product={{
          name: "Online-Schulung",
          unitAmount: null,
          currency: "EUR",
          taxBehavior: null,
          available: false,
        }}
      />,
    );

    expect(screen.getByText("149 €")).toBeVisible();
    expect(screen.getByText("inkl. MwSt.")).toBeVisible();
    expect(
      screen.queryByText("Preis wird im sicheren Checkout angezeigt"),
    ).not.toBeInTheDocument();
  });

  it("verwendet dieselbe Preiskomponente auch direkt im Checkout", () => {
    const checkoutPage = readFileSync(
      resolve(process.cwd(), "src/app/checkout/page.tsx"),
      "utf8",
    );

    expect(checkoutPage).toContain(
      'import { PriceDisplay } from "@/components/marketing/price-display"',
    );
    expect(checkoutPage).toContain(
      "<PriceDisplay product={product} inverse />",
    );
  });
});
