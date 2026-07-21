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
        <h2>Vertretung</h2>
        {provider.representative ? (
          <p>{provider.representative}</p>
        ) : (
          <PlaceholderBlock>
            Vertretungsberechtigte Person nach rechtlicher Prüfung ergänzen.
          </PlaceholderBlock>
        )}
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

      {provider.vatId || !released ? (
        <section>
          <h2>Steuerangaben</h2>
          {provider.vatId ? (
            <p>Umsatzsteuer-Identifikationsnummer: {provider.vatId}</p>
          ) : (
            <PlaceholderBlock>
              Umsatzsteuer-Identifikationsnummer ergänzen, sofern vorhanden und
              rechtlich anzugeben.
            </PlaceholderBlock>
          )}
        </section>
      ) : null}

      {!released ? (
        <>
          <section>
            <h2>Register- und berufsrechtliche Angaben</h2>
            <PlaceholderBlock>
              Registergericht, Registernummer und weitere berufs- oder
              aufsichtsrechtliche Angaben ergänzen, sofern einschlägig.
            </PlaceholderBlock>
          </section>
          <section>
            <h2>Inhaltlich verantwortliche Person</h2>
            <PlaceholderBlock>
              Name und Anschrift nach rechtlicher Prüfung ergänzen, sofern für
              journalistisch-redaktionelle Inhalte erforderlich.
            </PlaceholderBlock>
          </section>
          <section>
            <h2>Verbraucherstreitbeilegung</h2>
            <PlaceholderBlock>
              Geprüfte Erklärung zur Teilnahmebereitschaft oder
              Teilnahmeverpflichtung ergänzen.
            </PlaceholderBlock>
          </section>
        </>
      ) : null}
    </LegalDocument>
  );
}
