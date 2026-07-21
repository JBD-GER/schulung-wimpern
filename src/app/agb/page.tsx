import type { Metadata } from "next";
import {
  LegalDocument,
  PlaceholderBlock,
  ProviderAddress,
} from "@/components/marketing/legal-document";
import { COURSE_ACCESS_DESCRIPTION } from "@/data/access-policy";
import { getReleaseContract, legalPageMetadata } from "@/lib/server/release";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return legalPageMetadata({
    title: "Allgemeine Geschäftsbedingungen",
    description:
      "Bedingungen für Buchung und Nutzung der Online-Schulung Wimpernverlängerung.",
    draftDescription:
      "Technischer Entwurf der AGB für die Online-Schulung Wimpernverlängerung.",
    canonical: "/agb",
  });
}

export default function TermsPage() {
  const release = getReleaseContract();
  const released = release.legal.approved;
  const provider = release.legal.releasedProvider ?? release.legal.provider;

  return (
    <LegalDocument
      eyebrow="Vertragsbedingungen"
      title="Allgemeine Geschäftsbedingungen"
      introduction={
        released
          ? "Bedingungen für Buchung und Nutzung der Online-Schulung Wimpernverlängerung."
          : "Technischer Entwurf für Buchung und Nutzung der Online-Schulung Wimpernverlängerung."
      }
      released={released}
    >
      <section>
        <h2>1. Anbieter und Geltungsbereich</h2>
        {released ? (
          <p>
            Anbieter der auf dieser Website angebotenen Online-Schulung ist:
          </p>
        ) : (
          <p>
            Diese Bedingungen sollen für Verträge über die auf der Website
            angebotene Online-Schulung gelten. Die finale Fassung muss zwischen
            Verbraucherinnen, Unternehmerinnen und gegebenenfalls besonderen
            Unternehmensbuchungen rechtssicher unterscheiden.
          </p>
        )}
        <ProviderAddress provider={provider} showContact />
        {!released ? (
          <PlaceholderBlock>
            Anbieter, Anschrift, Kontakt und Geltungsbereich vollständig
            ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>2. Vertragsgegenstand</h2>
        <p>
          Vertragsgegenstand ist der persönliche Zugang zum Kurs
          „Online-Schulung Wimpernverlängerung &amp; Wimpernstylistin“ mit
          sieben Lernvideos, sieben Wissenstests, ergänzenden Materialien,
          Teilnehmerbereich und persönlichem Abschlusszertifikat nach
          erfolgreichem Bestehen.
        </p>
        <p>
          Die Schulung vermittelt Grundlagen und praktische Visualisierungen.
          Sie ersetzt keine individuelle medizinische, rechtliche oder
          versicherungsbezogene Beratung und keine eigenverantwortliche
          praktische Übung.
        </p>
      </section>

      <section>
        <h2>3. Vertragsschluss und Korrekturmöglichkeiten</h2>
        <p>
          Die Darstellung der Schulung beschreibt das Angebot. Vor der
          zahlungspflichtigen Bestellung werden Produkt, aktueller Stripe-Preis,
          Steuerdarstellung, Rechnungsdaten und Pflichtinformationen
          zusammengefasst. Eingabefehler können bis zum Absenden korrigiert
          werden.
        </p>
        {!released ? (
          <>
            <p>
              Der Vertragsschluss und die Bestellbestätigung sind mit der
              tatsächlichen Checkout-Konfiguration, dem Zeitpunkt der
              Zahlungsbestätigung und dem finalen Vertragsmodell abzugleichen.
            </p>
            <PlaceholderBlock>
              Verbindlichen Zeitpunkt des Vertragsschlusses und Vertragssprache
              ergänzen.
            </PlaceholderBlock>
          </>
        ) : null}
      </section>

      <section>
        <h2>4. Benutzerkonto</h2>
        <p>
          Die Teilnehmerin erstellt im Checkout ein persönliches Konto.
          Zugangsdaten sind geheim zu halten und dürfen nicht an Dritte
          weitergegeben werden. Angaben müssen korrekt und aktuell sein;
          insbesondere der Zertifikatsname ist vor Ausstellung zu prüfen.
        </p>
        <p>
          Bei Verdacht auf Missbrauch kann der Zugang vorübergehend gesichert
          oder gesperrt werden. Eine dauerhafte Entziehung richtet sich nach den
          gesetzlichen und vertraglichen Voraussetzungen.
        </p>
      </section>

      <section>
        <h2>5. Preis, Zahlung und Rechnung</h2>
        <p>
          Es gilt ausschließlich der im Checkout aus Stripe abgerufene
          Gesamtpreis einschließlich der dort dargestellten Steuerbehandlung.
          Die Buchung ist eine Einmalzahlung ohne Abonnement oder automatische
          Verlängerung.
        </p>
        <p>
          Verfügbare Zahlungsmethoden werden dynamisch im Checkout angezeigt.
          Eine Rechnung wird nach erfolgreicher Zahlung über Stripe
          bereitgestellt.
        </p>
      </section>

      <section>
        <h2>6. Freischaltung</h2>
        <p>
          Der Zugang wird erst freigeschaltet, nachdem die Zahlung durch ein
          validiertes Zahlungsereignis als erfolgreich bestätigt wurde. Eine
          bloße Rückkehr auf die Erfolgsseite genügt nicht. Bei verzögerten
          Zahlungsarten erfolgt die Freischaltung nach deren Bestätigung.
        </p>
      </section>

      <section>
        <h2>7. Kursablauf und Wissenstests</h2>
        <p>
          Nach mindestens 90 Prozent angesehenem Video wird der zugehörige
          Wissenstest freigeschaltet. Jeder Test enthält fünf Fragen mit vier
          Antwortmöglichkeiten und genau einer richtigen Antwort. Die Auswertung
          erfolgt nach Abgabe aller Antworten.
        </p>
        <p>
          Eine Lektion ist mit mindestens vier von fünf richtigen Antworten
          bestanden. Nicht bestandene Tests können ohne zusätzliche Kosten
          wiederholt werden. Die nächste Lektion wird erst nach bestandener
          vorheriger Lektion freigeschaltet.
        </p>
      </section>

      <section>
        <h2>8. Abschlusszertifikat</h2>
        <p>
          Nach sieben bestandenen Lektionen wird ein personalisiertes
          Abschlusszertifikat dieser Schulung erstellt. Es dokumentiert den
          Kursabschluss, ist aber kein staatlich anerkannter Berufsabschluss.
          Die Teilnehmerin ist für die Richtigkeit ihres Zertifikatsnamens
          verantwortlich und muss den angezeigten Vor- und Nachnamen vor der
          Ausstellung ausdrücklich bestätigen.
        </p>
        <p>
          Die automatische Ausstellung kann pro Kursabschluss nur einmal
          ausgelöst werden; das danach bereitgestellte Zertifikat bleibt
          inhaltlich unveränderlich. Eine spätere Namenskorrektur ist nicht im
          Selbstbedienungsbereich möglich und erfordert eine gesonderte Prüfung
          durch den Support. Ob ein gesonderter Korrekturprozess angeboten
          werden kann und ob dafür zusätzliche Kosten anfallen, wird erst im
          Rahmen dieser Prüfung mitgeteilt. Ein automatisierter Anspruch auf
          Neuausstellung wird dadurch nicht begründet. Gesetzliche Rechte
          bleiben unberührt.
        </p>
      </section>

      <section>
        <h2>9. Kurszugang und technische Verfügbarkeit</h2>
        <p>{COURSE_ACCESS_DESCRIPTION}</p>
        <p>
          Wartung, Sicherheitsmaßnahmen oder Störungen bei erforderlichen
          Dienstleistern können die Verfügbarkeit vorübergehend beeinträchtigen;
          gesetzliche Rechte bleiben unberührt.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Unbefristete Zugangsregelung, Updatepflichten und technische
            Verfügbarkeit rechtlich prüfen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>10. Nutzungsrechte und Schutz der Inhalte</h2>
        <p>
          Der Zugang ist persönlich und für eigene Lernzwecke bestimmt. Videos,
          Materialien, Quizfragen und Zertifikatsvorlagen dürfen ohne
          entsprechende Erlaubnis nicht veröffentlicht, weiterverkauft,
          vervielfältigt oder Dritten zugänglich gemacht werden. Gesetzlich
          zulässige Nutzungen bleiben unberührt.
        </p>
      </section>

      <section>
        <h2>11. Verantwortung bei der praktischen Anwendung</h2>
        <p>
          Teilnehmerinnen müssen Herstellerangaben, Hygiene- und
          Sicherheitshinweise, individuelle Kundinnenvoraussetzungen sowie
          einschlägige rechtliche Anforderungen eigenverantwortlich beachten.
          Der Kurs allein begründet keine Erlaubnis, Anerkennung oder Garantie
          für einen wirtschaftlichen Erfolg.
        </p>
      </section>

      <section>
        <h2>12. Widerruf</h2>
        {released ? (
          <p>
            Für Verbraucherinnen gelten die gesetzlichen Widerrufsrechte. Die
            Einzelheiten sind in der Widerrufsbelehrung beschrieben.
          </p>
        ) : (
          <p>
            Für Verbraucherinnen gelten die gesetzlichen Widerrufsrechte. Die
            konkrete Widerrufsbelehrung, der Beginn vor Ablauf der
            Widerrufsfrist und ein mögliches Erlöschen des Widerrufsrechts
            müssen passend zur rechtlichen Einordnung des Onlinekurses gestaltet
            und dokumentiert werden.
          </p>
        )}
        <p>
          Weitere Informationen enthält die{" "}
          <a href="/widerruf">Widerrufsbelehrung</a>.
        </p>
      </section>

      <section>
        <h2>13. Mängelrechte, Haftung und Rückabwicklung</h2>
        <p>
          Gesetzliche Rechte bei mangelhafter oder nicht bereitgestellter
          Leistung bleiben unberührt.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Rechtlich geprüfte Regelungen zu Mängelrechten, Haftung,
            Erstattungen und Sperrung ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      {!released ? (
        <section>
          <h2>14. Schlussbestimmungen</h2>
          <p>
            Rechtswahl, Gerichtsstand, Vertragstextspeicherung und
            Streitbeilegung müssen nach Zielgruppe und Unternehmenssitz
            rechtlich geprüft werden. Zwingende Verbraucherschutzvorschriften
            bleiben unberührt.
          </p>
          <PlaceholderBlock>
            Schlussbestimmungen und Stand der AGB ergänzen.
          </PlaceholderBlock>
        </section>
      ) : null}
    </LegalDocument>
  );
}
