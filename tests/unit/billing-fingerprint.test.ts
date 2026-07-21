// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createBillingFingerprint,
  normalizeTaxId,
  readBillingFingerprint,
} from "@/lib/billing-fingerprint";

describe("unveränderlicher Checkout-Kontext", () => {
  it("bildet denselben Fingerprint unabhängig von der Objektschlüssel-Reihenfolge", () => {
    expect(
      createBillingFingerprint({
        address: { city: "Berlin", country: "DE" },
        billingType: "business",
      }),
    ).toBe(
      createBillingFingerprint({
        billingType: "business",
        address: { country: "DE", city: "Berlin" },
      }),
    );
  });

  it("trennt geänderte Rechnungs- und Produktkontexte", () => {
    const original = {
      billingType: "private",
      address: { city: "Berlin" },
      priceId: "price_1",
    };
    expect(
      createBillingFingerprint({
        ...original,
        address: { city: "Hamburg" },
      }),
    ).not.toBe(createBillingFingerprint(original));
    expect(
      createBillingFingerprint({ ...original, priceId: "price_2" }),
    ).not.toBe(createBillingFingerprint(original));
  });

  it("normalisiert Steuer-IDs und akzeptiert nur SHA-256-Fingerprints", () => {
    expect(normalizeTaxId(" de-123.456 789 ")).toBe("DE123456789");
    const fingerprint = createBillingFingerprint({ taxId: "DE123456789" });
    expect(readBillingFingerprint({ billingFingerprint: fingerprint })).toBe(
      fingerprint,
    );
    expect(readBillingFingerprint({ billingFingerprint: "legacy" })).toBeNull();
  });
});
