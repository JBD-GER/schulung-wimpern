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

  it("bildet alle eingesetzten Auftrags- und Infrastruktur-Dienste sowie Cookies ab", () => {
    const html = renderToStaticMarkup(privacy.default());

    for (const provider of [
      "Vercel",
      "Supabase",
      "Stripe",
      "Cloudflare",
      "Resend",
    ]) {
      expect(html).toContain(provider);
    }
    expect(html).toContain("swv_consent");
    expect(html).toContain("swv_consent_id");
    expect(html).toContain("sb-…-auth-token");
    expect(html).toContain("__stripe_mid");
    expect(html).toContain("eu-central-1");
  });

  it("beschreibt Payment-first, dauerhaften Zugang und einmalige Zertifikatsausstellung", () => {
    const html = renderToStaticMarkup(terms.default());

    expect(html).toContain("kein neues Konto angelegt");
    expect(html).toContain(
      "Browser-Rückkehr oder ein ungeprüfter Zahlungsstatus genügen nicht",
    );
    expect(html).toContain("unbefristeten Zugang");
    expect(html).toContain("einmalig ein persönliches Zertifikat");
    expect(html).toContain("im Selbstbedienungsbereich unveränderlich");
  });

  it("veröffentlicht Register- und Streitbeilegungsangaben nur aus der freigegebenen Konfiguration", () => {
    const html = renderToStaticMarkup(imprint.default());

    expect(html).toContain("Amtsgericht Berlin-Charlottenburg");
    expect(html).toContain("HRB 123456");
    expect(html).toContain(
      releasedEnvironment.NEXT_PUBLIC_LEGAL_DISPUTE_STATEMENT,
    );
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

  it("hält unvollständige Rechtstexte ohne interne Technikhinweise noindex und aus der Sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_STREET", "");

    expect(imprint.generateMetadata().robots).toMatchObject({
      index: false,
      follow: true,
    });
    expect(renderToStaticMarkup(imprint.default())).not.toContain(
      "Technischer Entwurf",
    );
    expect(sitemap().map((entry) => entry.url)).not.toContain(
      "https://www.schulung-wimpernverlaengerung.de/impressum",
    );
  });

  it("liefert stabile Sitemap-Signale und normalisiert einen abschließenden Slash", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://www.schulung-wimpernverlaengerung.de/",
    );

    const entries = sitemap();
    expect(entries).toContainEqual({
      url: "https://www.schulung-wimpernverlaengerung.de/",
      changeFrequency: "weekly",
      priority: 1,
    });
    expect(entries).toContainEqual({
      url: "https://www.schulung-wimpernverlaengerung.de/fragen",
      changeFrequency: "monthly",
      priority: 0.8,
    });
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
  });
});
