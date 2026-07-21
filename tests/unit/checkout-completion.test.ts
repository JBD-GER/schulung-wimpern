// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/validation/checkout";

const requiredCheckoutValues = {
  billingType: "business" as const,
  firstName: "Ada",
  lastName: "Lovelace",
  companyName: "Analytical Lashes",
  contactPerson: "Ada Lovelace",
  legalForm: "Einzelunternehmen",
  companyCountry: "de",
  street: "Hauptstraße 12",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
  taxId: "DE123456789",
  termsAccepted: true as const,
  earlyAccessAccepted: true as const,
  consentVersion: "checkout-2026-07-21",
};

describe("vollständiger Checkout-Vertrag", () => {
  it("übernimmt Unternehmensland, Rechtsform und eine abweichende Rechnungsadresse", () => {
    const result = checkoutSchema.parse({
      ...requiredCheckoutValues,
      differentBillingAddress: true,
      billingStreet: "Rechnungsweg 7",
      billingPostalCode: "10117",
      billingCity: "Berlin",
      billingCountry: "at",
    });

    expect(result.companyCountry).toBe("DE");
    expect(result.legalForm).toBe("Einzelunternehmen");
    expect(result.billingCountry).toBe("AT");
    expect(result.differentBillingAddress).toBe(true);
  });

  it("weist eine unvollständige abweichende Rechnungsadresse zurück", () => {
    const result = checkoutSchema.safeParse({
      ...requiredCheckoutValues,
      differentBillingAddress: true,
      billingStreet: "",
      billingPostalCode: "",
      billingCity: "",
      billingCountry: "DE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          "billingStreet",
          "billingPostalCode",
          "billingCity",
        ]),
      );
    }
  });

  it("zeigt die Bestellbestätigung nur aus dem serverseitigen Order-Vertrag", () => {
    const statusUi = readFileSync(
      resolve(process.cwd(), "src/components/checkout/payment-status.tsx"),
      "utf8",
    );
    const statusRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/checkout/status/route.ts"),
      "utf8",
    );

    expect(statusUi).toContain("Bestellbestätigung");
    expect(statusUi).toContain("readOrderConfirmation(data.order)");
    expect(statusUi).not.toMatch(/(?:€\s*\d|\d[\d.,]*\s*€)/);
    expect(statusRoute).toContain("amountTotal: order.amount_total");
    expect(statusRoute).toContain("currency: order.currency");
    expect(statusRoute).toContain("productName:");
    expect(statusRoute).toContain('.eq("status", "revoked")');
    expect(statusRoute).toContain("return revokedResponse()");
  });

  it("übergibt Rechtsform und Ansprechpartner an die Stripe-Rechnung", () => {
    const sessionRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/checkout/session/route.ts"),
      "utf8",
    );
    const checkoutUi = readFileSync(
      resolve(process.cwd(), "src/components/checkout/checkout-flow.tsx"),
      "utf8",
    );

    expect(sessionRoute).toContain(
      '`${companyName}${legalForm ? ` ${legalForm}` : ""}`',
    );
    expect(sessionRoute).toContain('name: "Ansprechpartner"');
    expect(sessionRoute).toContain("contact_person:");
    expect(checkoutUi).toContain("getInvoiceName(billing)");
  });

  it("lässt die Zahlung erst mit Stripe-bestätigter Steuer- und Gesamtsumme zu", () => {
    const sessionRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/checkout/session/route.ts"),
      "utf8",
    );
    const checkoutUi = readFileSync(
      resolve(process.cwd(), "src/components/checkout/checkout-flow.tsx"),
      "utf8",
    );

    expect(sessionRoute).toContain("getCheckoutTotals(session");
    expect(sessionRoute).toContain(
      "export async function GET(request: Request)",
    );
    expect(sessionRoute).toContain('.eq("user_id", user.id)');
    expect(checkoutUi).toContain('session.totals.status !== "ready"');
    expect(checkoutUi).toContain("Darin enthaltene Umsatzsteuer");
    expect(checkoutUi).toContain("Gesamtbetrag");
    expect(checkoutUi).toContain("formatPrice(totals.total, totals.currency)");
  });

  it("bezieht die versionierte Rechtseinwilligung serverseitig statt aus einem Client-Literal", () => {
    const checkoutUi = readFileSync(
      resolve(process.cwd(), "src/components/checkout/checkout-flow.tsx"),
      "utf8",
    );
    const checkoutPage = readFileSync(
      resolve(process.cwd(), "src/app/checkout/page.tsx"),
      "utf8",
    );

    expect(checkoutUi).toContain("consentVersion,");
    expect(checkoutUi).not.toContain('consentVersion: "checkout-2026-07-21"');
    expect(checkoutPage).toContain('optionalEnv("CHECKOUT_CONSENT_VERSION")');
  });

  it("serialisiert den einen Customer und bindet Sessions an kanonische Rechnungsdaten", () => {
    const sessionRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/checkout/session/route.ts"),
      "utf8",
    );
    const checkoutUi = readFileSync(
      resolve(process.cwd(), "src/components/checkout/checkout-flow.tsx"),
      "utf8",
    );

    expect(sessionRoute).toContain("createBillingFingerprint");
    expect(sessionRoute).toContain("billingFingerprint");
    expect(sessionRoute).toContain("billing_fingerprint");
    expect(sessionRoute).toContain("reconcileCustomerTaxIds");
    expect(sessionRoute).toContain("acquire_checkout_customer_lease");
    expect(sessionRoute).toContain("release_checkout_customer_lease");
    expect(sessionRoute).toContain("confirm_checkout_session_rotation");
    expect(sessionRoute).toContain("update_checkout_profile_under_lease");
    expect(sessionRoute).toContain("{ idempotencyKey: `customer-${user.id}` }");
    expect(sessionRoute).toContain("stripe.customers.list");
    expect(sessionRoute).not.toContain("stripe.customers.del");
    expect(sessionRoute).toContain("stripe.customers.update");
    expect(sessionRoute).toContain("stripe.customers.retrieve");
    expect(sessionRoute).toContain(
      "`checkout-customer-update-${orderId}-${billingFingerprint}`",
    );
    expect(sessionRoute).toContain(
      "`checkout-customer-recovery-${orderId}-${leaseToken}`",
    );
    expect(sessionRoute).toContain(
      "const companyName = isBusiness ? (input.companyName?.trim() ?? null) : null",
    );
    expect(sessionRoute).toContain("company_name: companyName");
    expect(sessionRoute).toContain("tax_id: taxId");
    expect(checkoutUi).toContain("shouldUnregister: true");
    expect(checkoutUi).toContain('.default("DE")');
    expect(checkoutUi).toContain("differentBillingAddressRegistration");
  });
});
