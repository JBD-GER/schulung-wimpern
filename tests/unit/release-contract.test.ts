// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COURSE_ACCESS_DESCRIPTION } from "@/data/access-policy";
import { FAQS } from "@/data/course";

vi.mock("server-only", () => ({}));

const completeEnvironment = {
  CONTENT_RELEASE_APPROVED: "true",
  LEGAL_TEXTS_APPROVED: "true",
  NEXT_PUBLIC_SITE_URL: "https://www.schulung-wimpernverlaengerung.de",
  NEXT_PUBLIC_COOKIE_CONSENT_VERSION: "cookies-2026-07-21",
  NEXT_PUBLIC_LEGAL_COMPANY_NAME: "Lash Akademie GmbH",
  NEXT_PUBLIC_LEGAL_REPRESENTATIVE: "Lea Kirfel",
  NEXT_PUBLIC_LEGAL_STREET: "Hauptstraße 12",
  NEXT_PUBLIC_LEGAL_POSTAL_CITY: "10115 Berlin",
  NEXT_PUBLIC_LEGAL_COUNTRY: "Deutschland",
  NEXT_PUBLIC_LEGAL_EMAIL: "kontakt@lash-akademie.test",
  NEXT_PUBLIC_LEGAL_PHONE: "+49 30 12345678",
  NEXT_PUBLIC_LEGAL_VAT_ID: "DE123456789",
  NEXT_PUBLIC_LEGAL_WID_STATUS: "not_assigned",
  NEXT_PUBLIC_LEGAL_WID_ID: "",
  NEXT_PUBLIC_LEGAL_REGISTER_STATUS: "registered",
  NEXT_PUBLIC_LEGAL_REGISTER_COURT: "Amtsgericht Berlin-Charlottenburg",
  NEXT_PUBLIC_LEGAL_REGISTER_NUMBER: "HRB 123456",
  NEXT_PUBLIC_LEGAL_DISPUTE_STATEMENT:
    "Wir nehmen an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle nicht teil.",
  CHECKOUT_CONSENT_VERSION: "checkout-2026-07-21",
  CHECKOUT_LEGAL_TEXT_HASH:
    "sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  LEGAL_TEXT_CONTENT_HASH:
    "sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  CHECKOUT_INTENT_SECRET:
    "test-checkout-intent-secret-with-more-than-32-characters",
  CRON_SECRET: "test-cron-secret-with-more-than-32-characters",
  TRUSTED_CLIENT_IP_SOURCE: "vercel",
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
    expect(contract.operational.ready).toBe(true);
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

  it("blockiert bei ungültiger Basis-URL, Cookie-Version oder Betriebssecrets", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_COOKIE_CONSENT_VERSION: "",
      CHECKOUT_INTENT_SECRET: "short",
      CRON_SECRET: "",
      TRUSTED_CLIENT_IP_SOURCE: "",
    });

    expect(contract.readyForSale).toBe(false);
    expect(contract.legal.missing).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_SITE_URL",
        "NEXT_PUBLIC_COOKIE_CONSENT_VERSION",
      ]),
    );
    expect(contract.operational.missing).toEqual(
      expect.arrayContaining([
        "CHECKOUT_INTENT_SECRET",
        "CRON_SECRET",
        "TRUSTED_CLIENT_IP_SOURCE",
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

  it("weist einen formal gültigen, aber nicht mehr aktuellen Freigabehash zurück", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      CHECKOUT_LEGAL_TEXT_HASH:
        "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab",
    });

    expect(contract.readyForSale).toBe(false);
    expect(contract.legal.missing).toContain("CHECKOUT_LEGAL_TEXT_HASH");
  });

  it("benötigt keine separate Laufzeitkonfiguration für die Release-Freigabe", () => {
    const contract = resolveReleaseContract(completeEnvironment);

    expect(contract.legal.approved).toBe(true);
    expect(contract.legal.missing).toEqual([]);
  });

  it("verlangt eine ausdrückliche Register- und Streitbeilegungserklärung", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_REGISTER_STATUS: "",
      NEXT_PUBLIC_LEGAL_DISPUTE_STATEMENT: "",
    });

    expect(contract.legal.approved).toBe(false);
    expect(contract.legal.missing).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_LEGAL_REGISTER_STATUS",
        "NEXT_PUBLIC_LEGAL_DISPUTE_STATEMENT",
      ]),
    );
  });

  it("verlangt eine ausdrückliche W-IdNr.-Entscheidung und bei Zuteilung die Nummer", () => {
    const unknown = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_WID_STATUS: "",
    });
    const missingNumber = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_WID_STATUS: "assigned",
      NEXT_PUBLIC_LEGAL_WID_ID: "",
    });
    const assigned = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_WID_STATUS: "assigned",
      NEXT_PUBLIC_LEGAL_WID_ID: "DE123456789-00001",
    });

    expect(unknown.legal.missing).toContain("NEXT_PUBLIC_LEGAL_WID_STATUS");
    expect(missingNumber.legal.missing).toContain("NEXT_PUBLIC_LEGAL_WID_ID");
    expect(assigned.legal.approved).toBe(true);
  });

  it("akzeptiert die ausdrückliche Erklärung, dass kein Registereintrag besteht", () => {
    const contract = resolveReleaseContract({
      ...completeEnvironment,
      NEXT_PUBLIC_LEGAL_REGISTER_STATUS: "not_registered",
      NEXT_PUBLIC_LEGAL_REGISTER_COURT: "",
      NEXT_PUBLIC_LEGAL_REGISTER_NUMBER: "",
    });

    expect(contract.legal.approved).toBe(true);
    expect(contract.legal.releasedProvider?.registerStatus).toBe(
      "not_registered",
    );
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
