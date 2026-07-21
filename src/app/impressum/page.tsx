import type { Metadata } from "next";
import {
  LegalDocument,
  PlaceholderBlock,
  ProviderAddress,
} from "@/components/marketing/legal-document";
import { getReleaseContract, legalPageMetadata } from "@/lib/server/release";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return legalPageMetadata({
    title: "Impressum",
    description:
      "Anbieter- und Kontaktinformationen der Schulung Wimpernverlängerung.",
    draftDescription:
      "Technischer Entwurf des Impressums für die Schulung Wimpernverlängerung.",
    canonical: "/impressum",
  });
}

const providerLabels: Record<string, string> = {
  NEXT_PUBLIC_LEGAL_COMPANY_NAME: "vollständiger Name beziehungsweise Firma",
  NEXT_PUBLIC_LEGAL_REPRESENTATIVE: "vertretungsberechtigte Person",
  NEXT_PUBLIC_LEGAL_STREET: "Straße und Hausnummer",
  NEXT_PUBLIC_LEGAL_POSTAL_CITY: "Postleitzahl und Ort",
  NEXT_PUBLIC_LEGAL_COUNTRY: "Land",
  NEXT_PUBLIC_LEGAL_EMAIL: "rechtliche Kontakt-E-Mail",
  NEXT_PUBLIC_LEGAL_PHONE: "Telefonnummer",
  NEXT_PUBLIC_LEGAL_WID_STATUS:
    "Erklärung, ob eine Wirtschafts-Identifikationsnummer zugeteilt wurde",
  NEXT_PUBLIC_LEGAL_WID_ID: "Wirtschafts-Identifikationsnummer",
  NEXT_PUBLIC_LEGAL_REGISTER_STATUS:
    "Erklärung zum Registerstatus (registered oder not_registered)",
  NEXT_PUBLIC_LEGAL_REGISTER_COURT: "Registergericht",
  NEXT_PUBLIC_LEGAL_REGISTER_NUMBER: "Registernummer",
  NEXT_PUBLIC_LEGAL_DISPUTE_STATEMENT:
    "geprüfte Erklärung zur Verbraucherstreitbeilegung",
};

export default function ImprintPage() {
  const release = getReleaseContract();
  const released = release.legal.approved;
  const provider = release.legal.releasedProvider ?? release.legal.provider;
  const missingProviderLabels = release.legal.missing
    .map((field) => providerLabels[field])
    .filter((label): label is string => Boolean(label));

  return (
    <LegalDocument
      eyebrow="Rechtliche Informationen"
      title="Impressum"
      introduction="Anbieterkennzeichnung für die Website und Lernplattform schulung-wimpernverlaengerung.de."
      released={released}
    >
      <section>
        <h2>Anbieterangaben</h2>
        <ProviderAddress provider={provider} />
        {!released && missingProviderLabels.length ? (
          <PlaceholderBlock>
            Noch zu ergänzen: {missingProviderLabels.join(", ")}.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>Vertretungsberechtigte Person</h2>
        <p>{provider.representative ?? provider.companyName}</p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <ProviderAddress provider={provider} showAddress={false} showContact />
        {!released && (!provider.email || !provider.phone) ? (
          <PlaceholderBlock>
            Erreichbare rechtliche Kontaktwege vollständig ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      {provider.vatId ? (
        <section>
          <h2>Umsatzsteuer-Identifikationsnummer</h2>
          <p>gemäß § 27a Umsatzsteuergesetz: {provider.vatId}</p>
        </section>
      ) : null}

      {provider.widStatus === "assigned" && provider.widId ? (
        <section>
          <h2>Wirtschafts-Identifikationsnummer</h2>
          <p>gemäß § 139c Abgabenordnung: {provider.widId}</p>
        </section>
      ) : null}

      {provider.registerStatus === "registered" ? (
        <section>
          <h2>Registereintrag</h2>
          <p>
            Registergericht: {provider.registerCourt}
            <br />
            Registernummer: {provider.registerNumber}
          </p>
        </section>
      ) : !provider.registerStatus ? (
        <section>
          <h2>Registerangaben</h2>
          <PlaceholderBlock>
            Bitte verbindlich festlegen, ob ein Registereintrag besteht. Bei
            einem Eintrag müssen Registergericht und Registernummer angegeben
            werden.
          </PlaceholderBlock>
        </section>
      ) : null}

      <section>
        <h2>Verantwortlich für journalistisch-redaktionelle Inhalte</h2>
        <p>{provider.representative ?? provider.companyName}</p>
        <ProviderAddress provider={provider} showContact={false} />
      </section>

      <section>
        <h2>Verbraucherstreitbeilegung</h2>
        {provider.disputeStatement ? (
          <p>{provider.disputeStatement}</p>
        ) : (
          <PlaceholderBlock>
            Hier fehlt noch deine verbindliche, rechtlich geprüfte Entscheidung
            zur Teilnahme oder Nichtteilnahme an einem Verfahren vor einer
            Verbraucherschlichtungsstelle (§ 36 VSBG).
          </PlaceholderBlock>
        )}
      </section>

      <section>
        <h2>Stand</h2>
        <p>21. Juli 2026</p>
      </section>
    </LegalDocument>
  );
}
