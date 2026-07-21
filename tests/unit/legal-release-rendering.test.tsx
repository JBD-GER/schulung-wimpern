// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const releasedEnvironment = {
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

let imprint: typeof import("@/app/impressum/page");
let privacy: typeof import("@/app/datenschutz/page");
let terms: typeof import("@/app/agb/page");
let withdrawal: typeof import("@/app/widerruf/page");
let sitemap: typeof import("@/app/sitemap").default;

beforeAll(async () => {
  [imprint, privacy, terms, withdrawal, { default: sitemap }] =
    await Promise.all([
      import("@/app/impressum/page"),
      import("@/app/datenschutz/page"),
      import("@/app/agb/page"),
      import("@/app/widerruf/page"),
      import("@/app/sitemap"),
    ]);
});

beforeEach(() => {
  for (const [name, value] of Object.entries(releasedEnvironment))
    vi.stubEnv(name, value);
  vi.stubEnv(
    "NEXT_PUBLIC_SITE_URL",
    "https://www.schulung-wimpernverlaengerung.de",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Rechtstext-Release", () => {
  it("rendert nach vollständiger Freigabe Anbieterwerte ohne Entwurfsbanner oder Platzhalter", () => {
    const forbiddenDraftText = [
      "Technischer Entwurf",
      "vor Veröffentlichung",
      "Wichtiger Hinweis zur finalen Fassung",
      "Noch zu ergänzen:",
      "[Name/Firma",
    ];

    for (const page of [imprint, privacy, terms, withdrawal]) {
      const html = renderToStaticMarkup(page.default());
      expect(html).toContain("Lash Akademie GmbH");
      for (const text of forbiddenDraftText) expect(html).not.toContain(text);
    }

    const termsHtml = renderToStaticMarkup(terms.default());
    expect(termsHtml).toContain("unbefristeten Zugang");
    expect(termsHtml).toContain("Ausstellung deines Zertifikats");
  });

  it("rendert 'Nicht vorhanden' nicht als Umsatzsteuer-ID", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_VAT_ID", "Nicht vorhanden");

    const html = renderToStaticMarkup(imprint.default());
    expect(html).not.toContain("Nicht vorhanden");
    expect(html).not.toContain("Umsatzsteuer-Identifikationsnummer:");
  });

  it("indexiert Rechtstexte und nimmt sie erst nach vollständiger Freigabe in die Sitemap auf", () => {
    for (const page of [imprint, privacy, terms, withdrawal]) {
      expect(page.generateMetadata().robots).toMatchObject({
        index: true,
        follow: true,
      });
    }
    expect(sitemap().map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        "https://www.schulung-wimpernverlaengerung.de/impressum",
        "https://www.schulung-wimpernverlaengerung.de/datenschutz",
        "https://www.schulung-wimpernverlaengerung.de/agb",
        "https://www.schulung-wimpernverlaengerung.de/widerruf",
      ]),
    );
  });

  it("hält Entwürfe bei unvollständigem Anbieter noindex und aus der Sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_STREET", "");

    expect(imprint.generateMetadata().robots).toMatchObject({
      index: false,
      follow: true,
    });
    expect(renderToStaticMarkup(imprint.default())).toContain(
      "Technischer Entwurf",
    );
    expect(sitemap().map((entry) => entry.url)).not.toContain(
      "https://www.schulung-wimpernverlaengerung.de/impressum",
    );
  });
});
