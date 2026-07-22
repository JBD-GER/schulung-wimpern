import { describe, expect, it } from "vitest";

import {
  parsePrivacyConsent,
  serializePrivacyConsent,
  type PrivacyConsent,
} from "@/lib/privacy-consent";

describe("Datenschutzeinwilligung", () => {
  const consent: PrivacyConsent = {
    version: "cookies-2026-07-21",
    necessary: true,
    analytics: true,
    marketing: true,
    updatedAt: "2026-07-21T18:00:00.000Z",
  };

  it("liest nur eine unveränderte aktuelle Auswahl", () => {
    expect(
      parsePrivacyConsent(
        serializePrivacyConsent(consent),
        "cookies-2026-07-21",
      ),
    ).toEqual(consent);
  });

  it("übernimmt bestehende doppelt kodierte Cookies ohne erneute Abfrage", () => {
    const legacyValue = encodeURIComponent(
      encodeURIComponent([consent.version, "1", consent.updatedAt].join("|")),
    );

    expect(parsePrivacyConsent(legacyValue, consent.version)).toEqual({
      ...consent,
      marketing: false,
    });
  });

  it("übernimmt auch doppelt kodierte Cookies mit Marketingauswahl", () => {
    const value = encodeURIComponent(
      encodeURIComponent(serializePrivacyConsent(consent)),
    );

    expect(parsePrivacyConsent(value, consent.version)).toEqual(consent);
  });

  it("fragt bei neuer Version oder manipuliertem Wert erneut", () => {
    expect(
      parsePrivacyConsent(
        serializePrivacyConsent(consent),
        "cookies-2026-08-01",
      ),
    ).toBeNull();
    expect(
      parsePrivacyConsent("cookies-2026-07-21%7Cyes%7Ctoday", consent.version),
    ).toBeNull();
    expect(
      parsePrivacyConsent(
        "cookies-2026-07-21%7C1%7Cyes%7C2026-07-21T18%3A00%3A00.000Z",
        consent.version,
      ),
    ).toBeNull();
  });
});
