import type { Metadata } from "next";
import {
  LegalDocument,
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
      "Anbieter- und Kontaktinformationen der Schulung Wimpernverlängerung.",
    canonical: "/impressum",
  });
}

export default function ImprintPage() {
  const release = getReleaseContract();
  const provider = release.legal.releasedProvider ?? release.legal.provider;

  return (
    <LegalDocument
      eyebrow="Rechtliche Informationen"
      title="Impressum"
      introduction="Anbieterkennzeichnung für die Website und Lernplattform schulung-wimpernverlaengerung.de."
    >
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <ProviderAddress provider={provider} />
      </section>

      <section>
        <h2>Vertretungsberechtigung</h2>
        <p>Geschäftsführer: {provider.representative}</p>
      </section>

      {provider.registerStatus === "registered" ? (
        <section>
          <h2>Handelsregister</h2>
          <p>
            Die {provider.companyName} ist im Handelsregister des{" "}
            {provider.registerCourt} unter der Nummer {provider.registerNumber}{" "}
            eingetragen.
          </p>
        </section>
      ) : null}

      <section>
        <h2>Kontakt</h2>
        <ProviderAddress provider={provider} showAddress={false} showContact />
      </section>

      {provider.vatId ? (
        <section>
          <h2>Umsatzsteuer</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:{" "}
            {provider.vatId}
          </p>
        </section>
      ) : null}

      {provider.widStatus === "assigned" && provider.widId ? (
        <section>
          <h2>Wirtschafts-Identifikationsnummer</h2>
          <p>
            Wirtschafts-Identifikationsnummer gemäß § 139c AO: {provider.widId}
          </p>
        </section>
      ) : null}

      <section>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>{provider.disputeStatement}</p>
      </section>

      <section>
        <h2>Haftung für Inhalte</h2>
        <p>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach
          den allgemeinen Gesetzen verantwortlich. Verpflichtungen zur
          Entfernung oder Sperrung der Nutzung von Informationen nach den
          allgemeinen Gesetzen bleiben hiervon unberührt.
        </p>
        <p>
          Eine Haftung ist erst ab dem Zeitpunkt möglich, zu dem uns eine
          konkrete Rechtsverletzung bekannt wird. Sobald uns entsprechende
          Rechtsverletzungen bekannt werden, entfernen wir die betroffenen
          Inhalte unverzüglich.
        </p>
      </section>

      <section>
        <h2>Haftung für Links</h2>
        <p>
          Unser Angebot kann Links zu externen Websites Dritter enthalten, auf
          deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese
          fremden Inhalte keine Gewähr übernehmen. Für die Inhalte verlinkter
          Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich.
        </p>
        <p>
          Eine permanente inhaltliche Kontrolle verlinkter Seiten ist ohne
          konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Sobald
          uns Rechtsverletzungen bekannt werden, entfernen wir entsprechende
          Links unverzüglich.
        </p>
      </section>

      <section>
        <h2>Urheberrecht</h2>
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen
          Seiten unterliegen dem deutschen Urheberrecht. Vervielfältigung,
          Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
          Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des
          jeweiligen Autors beziehungsweise Erstellers. Downloads und Kopien
          dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch
          gestattet.
        </p>
        <p>
          Soweit Inhalte nicht vom Betreiber erstellt wurden, beachten wir die
          Urheberrechte Dritter und kennzeichnen solche Inhalte entsprechend.
          Solltest du dennoch auf eine mögliche Urheberrechtsverletzung
          aufmerksam werden, bitten wir um einen Hinweis. Sobald uns eine
          Rechtsverletzung bekannt wird, entfernen wir die betreffenden Inhalte
          unverzüglich.
        </p>
      </section>
    </LegalDocument>
  );
}
