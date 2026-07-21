// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COURSE_ACCESS_DESCRIPTION } from "@/data/access-policy";
import { FAQS } from "@/data/course";

vi.mock("server-only", () => ({}));

const completeEnvironment = {
  CONTENT_RELEASE_APPROVED: "true",
  LEGAL_TEXTS_APPROVED: "true",
  NEXT_PUBLIC_LEGAL_COMPANY_NAME: "Lash Akademie GmbH",
  NEXT_PUBLIC_LEGAL_REPRESENTATIVE: "Lea Kirfel",
  NEXT_PUBLIC_LEGAL_STREET: "Hauptstraße 12",
  NEXT_PUBLIC_LEGAL_POSTAL_CITY: "10115 Berlin",
  NEXT_PUBLIC_LEGAL_COUNTRY: "Deutschland",
  NEXT_PUBLIC_LEGAL_EMAIL: "kontakt@lash-akademie.test",
  NEXT_PUBLIC_LEGAL_PHONE: "+49 30 12345678",
  NEXT_PUBLIC_LEGAL_VAT_ID: "DE123456789",
  CHECKOUT_CONSENT_VERSION: "checkout-2026-07-21",
  CHECKOUT_LEGAL_TEXT_HASH:
    "sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
} as const;

let resolveReleaseContract: typeof import("@/lib/server/release").resolveReleaseContract;

beforeAll(async () => {
  ({ resolveReleaseContract } = await import("@/lib/server/release"));
});

describe("Release- und Anbieter-Vertrag", () => {
  it("gibt den Verkauf nur bei vollständiger Content-, Legal- und Anbieterfreigabe frei", () => {
    const contract = resolveReleaseContract(completeEnvironment);

    expect(contract.readyForSale).toBe(true);
    expect(contract.legal.approved).toBe(true);
    expect(contract.legal.releasedProvider?.companyName).toBe(
      "Lash Akademie GmbH",
    );
    expect(contract.legal.missing).toEqual([]);
  });

  it("bleibt bei fehlenden Anbieterangaben trotz gesetztem Flag geschlossen", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_STREET: "",
      NEXT_PUBLIC_LEGAL_EMAIL: "support@example.de",
    });

    expect(contract.legal.approvalRequested).toBe(true);
    expect(contract.legal.approved).toBe(false);
    expect(contract.readyForSale).toBe(false);
    expect(contract.legal.missing).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_LEGAL_STREET",
        "NEXT_PUBLIC_LEGAL_EMAIL",
      ]),
    );
  });

  it("weist einen Beispielhash und eine fehlende Consent-Version zurück", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      CHECKOUT_CONSENT_VERSION: "",
      CHECKOUT_LEGAL_TEXT_HASH: "sha256_REPLACE_WITH_APPROVED_TEXT_HASH",
    });

    expect(contract.legal.approved).toBe(false);
    expect(contract.readyForSale).toBe(false);
    expect(contract.legal.missing).toEqual(
      expect.arrayContaining([
        "CHECKOUT_CONSENT_VERSION",
        "CHECKOUT_LEGAL_TEXT_HASH",
      ]),
    );
  });

  it("weist einen offensichtlich synthetischen Ein-Zeichen-Hash zurück", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      CHECKOUT_LEGAL_TEXT_HASH: `sha256-${"a".repeat(64)}`,
    });

    expect(contract.readyForSale).toBe(false);
    expect(contract.legal.missing).toContain("CHECKOUT_LEGAL_TEXT_HASH");
  });

  it("benötigt keine separate Laufzeitkonfiguration für die Release-Freigabe", () => {
    const contract = resolveReleaseContract(completeEnvironment);

    expect(contract.legal.approved).toBe(true);
    expect(contract.legal.missing).toEqual([]);
  });

  it("stellt die feste unbefristete Zugangsregel über die gemeinsame FAQ-Quelle bereit", () => {
    const accessFaq = FAQS.find(
      (faq) => faq.question === "Wie lange habe ich Zugriff?",
    );

    expect(accessFaq?.answer).toBe(COURSE_ACCESS_DESCRIPTION);
    expect(accessFaq?.answer).toContain("unbefristeten Zugang");
    expect(accessFaq?.answer).toContain("Ausstellung deines Zertifikats");
  });

  it("behandelt 'Nicht vorhanden' als fehlende optionale USt-ID", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_VAT_ID: "Nicht vorhanden",
    });

    expect(contract.legal.approved).toBe(true);
    expect(contract.legal.releasedProvider?.vatId).toBeNull();
    expect(contract.legal.missing).not.toContain("NEXT_PUBLIC_LEGAL_VAT_ID");
  });
});
