import { describe, expect, it } from "vitest";

import {
  buildContractConfirmationText,
  createCheckoutContractSnapshot,
  EARLY_ACCESS_ACCEPTANCE_TEXT,
  readCheckoutContractSnapshot,
} from "@/data/checkout-legal";

const provider = {
  companyName: "Lea Kirfel",
  representative: "Lea Kirfel",
  street: "Großer Kamp 5a",
  postalCity: "31633 Leese",
  country: "Deutschland",
  email: "info@example.de",
  phone: "+49 5761 8429666",
  vatId: null,
  widStatus: "not_assigned" as const,
  widId: null,
  registerStatus: "not_registered" as const,
  registerCourt: null,
  registerNumber: null,
  disputeStatement: "Wir nehmen nicht an einem Streitbeilegungsverfahren teil.",
};

describe("dauerhafte Vertragsbestätigung", () => {
  it("friert Anbieter, AGB, Widerruf und die ausdrückliche Erklärung ein", () => {
    const snapshot = createCheckoutContractSnapshot({
      acceptedAt: "2026-07-21T18:30:00.000Z",
      siteUrl: "https://www.schulung-wimpernverlaengerung.de",
      termsVersion: "checkout-2026-07-21",
      legalTextHash: `sha256-${"a".repeat(64)}`,
      provider,
    });

    expect(readCheckoutContractSnapshot(snapshot)).toEqual(snapshot);
    expect(snapshot.termsText).toContain("ALLGEMEINE GESCHÄFTSBEDINGUNGEN");
    expect(snapshot.withdrawalText).toContain("WIDERRUFSBELEHRUNG");
    expect(snapshot.withdrawalText).toContain(
      "https://www.schulung-wimpernverlaengerung.de/widerruf#vertrag-widerrufen",
    );
    expect(snapshot.earlyAccessAcceptanceText).toBe(
      EARLY_ACCESS_ACCEPTANCE_TEXT,
    );
  });

  it("erstellt eine vollständige Bestellbestätigung ohne veränderlichen Webseitenlink als Ersatztext", () => {
    const snapshot = createCheckoutContractSnapshot({
      acceptedAt: "2026-07-21T18:30:00.000Z",
      siteUrl: "https://www.schulung-wimpernverlaengerung.de",
      termsVersion: "checkout-2026-07-21",
      legalTextHash: `sha256-${"b".repeat(64)}`,
      provider,
    });
    const confirmation = buildContractConfirmationText({
      snapshot,
      orderId: "f77cf5e7-77b9-4fa2-b620-31455c1965c5",
      productName: "Online-Schulung Wimpernverlängerung",
      amountTotal: 11900,
      currency: "eur",
      taxAmount: 1900,
      paidAt: "2026-07-21T18:31:00.000Z",
      participantEmail: "teilnehmerin@example.de",
      billingSnapshot: {
        invoiceName: "Erika Mustermann",
        billingAddress: {
          street: "Hauptstraße 12",
          postalCode: "10115",
          city: "Berlin",
          country: "DE",
        },
        paymentMethodLabel: "Kredit- oder Debitkarte über Stripe",
      },
    });

    expect(confirmation).toContain("119,00 €");
    expect(confirmation).toContain("19,00 €");
    expect(confirmation).toContain("VERBINDLICH BESTÄTIGTE ERKLÄRUNGEN");
    expect(confirmation).toContain("ALLGEMEINE GESCHÄFTSBEDINGUNGEN");
    expect(confirmation).toContain("MUSTER-WIDERRUFSFORMULAR");
    expect(confirmation).toContain(provider.companyName);
    expect(confirmation).toContain("Erika Mustermann");
    expect(confirmation).toContain("Hauptstraße 12, 10115 Berlin, DE");
  });

  it("verwirft unvollständige oder manipulierte Snapshots", () => {
    expect(
      readCheckoutContractSnapshot({
        schemaVersion: 1,
        acceptedAt: "not-a-date",
      }),
    ).toBeNull();
  });
});
