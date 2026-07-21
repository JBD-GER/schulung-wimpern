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
    title: "Datenschutz",
    description:
      "Datenschutzhinweise für Website, Checkout und Lernplattform der Schulung Wimpernverlängerung.",
    draftDescription:
      "Technischer Entwurf der Datenschutzerklärung für die Schulung Wimpernverlängerung.",
    canonical: "/datenschutz",
  });
}

export default function PrivacyPage() {
  const release = getReleaseContract();
  const released = release.legal.approved;
  const provider = release.legal.releasedProvider ?? release.legal.provider;

  return (
    <LegalDocument
      eyebrow="Datenschutz"
      title="Datenschutzerklärung"
      introduction={
        released
          ? "Diese Hinweise beschreiben die Datenverarbeitung auf der öffentlichen Website, im Checkout und in der persönlichen Lernplattform."
          : "Dieser Entwurf beschreibt die vorgesehenen Datenflüsse von öffentlicher Website, Checkout und persönlicher Lernplattform."
      }
      released={released}
    >
      <section>
        <h2>1. Verantwortliche Stelle</h2>
        <ProviderAddress provider={provider} showContact />
        {!released ? (
          <PlaceholderBlock>
            Verantwortliche Stelle, ladungsfähige Anschrift und
            Datenschutz-Kontakt vor Freigabe vollständig ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>2. Grundsätze der Verarbeitung</h2>
        <p>
          Die Plattform verarbeitet nur Daten, die für Benutzerkonto, Zahlung
          und Rechnung, Kursfreischaltung, Lernfortschritt, Zertifikat, Support,
          Sicherheit und gesetzliche Pflichten erforderlich sind.
        </p>
        {!released ? (
          <p>
            Die konkrete Zuordnung zu Rechtsgrundlagen, Aufbewahrungsfristen und
            Empfängern muss vor Veröffentlichung anhand des finalen
            Betriebsmodells und der abgeschlossenen Verträge zur
            Auftragsverarbeitung geprüft werden.
          </p>
        ) : null}
      </section>

      <section>
        <h2>3. Aufruf der Website und Hosting</h2>
        <p>
          Beim Aufruf der Website können technisch notwendige Verbindungs- und
          Protokolldaten verarbeitet werden, insbesondere IP-Adresse, Zeitpunkt,
          angeforderte Ressource, Referrer, Browserinformationen und
          Sicherheitsereignisse. Die Verarbeitung dient der Auslieferung,
          Stabilität und Missbrauchsabwehr.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Hostinganbieter, Standort, Rechtsgrundlage, Speicherdauer und
            Auftragsverarbeitung ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>4. Benutzerkonto und Anmeldung</h2>
        <p>
          Für das persönliche Konto werden insbesondere Vorname, Nachname,
          E-Mail-Adresse, Verifizierungsstatus und sicherheitsbezogene
          Sitzungsinformationen verarbeitet. Passwörter dürfen nicht im Klartext
          gespeichert werden; die Authentifizierung erfolgt über einen
          etablierten Anbieter.
        </p>
        {released ? (
          <p>
            Die Konto- und Anmeldefunktionen werden technisch über Supabase
            bereitgestellt.
          </p>
        ) : (
          <PlaceholderBlock>
            Authentifizierungsanbieter, Serverstandort, Empfänger,
            Drittlandbezug und Speicherdauer ergänzen.
          </PlaceholderBlock>
        )}
      </section>

      <section>
        <h2>5. Checkout, Zahlung und Rechnung</h2>
        <p>
          Im Checkout werden Konto- und Rechnungsdaten sowie
          Bestellinformationen verarbeitet. Zahlungsdaten werden direkt über
          Stripe erfasst; vollständige Karten- oder Kontodaten laufen nicht über
          den eigenen Server und werden nicht in der eigenen Datenbank
          gespeichert.
        </p>
        <p>
          Gespeichert werden können die für Bestellung, Freischaltung,
          Rückerstattung und Rechnungszuordnung erforderlichen
          Stripe-Referenzen, Zahlungsstatus, Betrag, Währung und Rechnungsdaten.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Stripe-Vertragspartei, Rechtsgrundlagen, Steuerkonfiguration,
            Empfänger, Übermittlungsmechanismen und Aufbewahrungsfristen
            ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>6. Kursnutzung und Lernfortschritt</h2>
        <p>
          Zur Bereitstellung des Kurses speichert die Plattform Einschreibung,
          freigeschaltete Lektionen, angesehene Videobereiche, Bearbeitungsstand
          sowie Ergebnisse und Zeitpunkte der Wissenstests. Diese Daten sind
          erforderlich, um den Lernpfad, Wiederholungen und den Kursabschluss
          nachvollziehbar bereitzustellen.
        </p>
        <p>
          Richtige Lösungsschlüssel werden nicht vor der Abgabe an den Browser
          übertragen. Quizantworten und Fortschrittsdaten sind nicht öffentlich.
        </p>
      </section>

      <section>
        <h2>7. Geschützte Videos</h2>
        <p>
          Vor jeder Videowiedergabe prüft die Plattform Anmeldung, aktiven
          Schulungszugang und Freischaltung der Lektion. Für die private
          Wiedergabe können kurzlebige Zugriffsdaten und sicherheitsbezogene
          Nutzungsinformationen verarbeitet werden.
        </p>
        {released ? (
          <p>
            Die geschützte Videowiedergabe wird technisch über Cloudflare Stream
            bereitgestellt.
          </p>
        ) : (
          <PlaceholderBlock>
            Cloudflare-Stream-Konfiguration, Vertragspartei, Standort,
            Rechtsgrundlage, Übermittlungen und Protokollfristen ergänzen.
          </PlaceholderBlock>
        )}
      </section>

      <section>
        <h2>8. Zertifikate und Zertifikatsprüfung</h2>
        <p>
          Nach erfolgreichem Abschluss werden Zertifikatsname, Kursversion,
          Ausstellungsdatum, eindeutige Zertifikatsnummer, Dateireferenz und
          Prüfsumme verarbeitet. Das PDF wird privat gespeichert.
        </p>
        <p>
          Auf der öffentlichen Prüfseite werden nur Gültigkeitsstatus, Kursname,
          Ausstellungsdatum und Zertifikatsnummer angezeigt. Ein vollständiger
          Teilnehmerinnenname darf dort nur mit ausdrücklicher Einwilligung
          erscheinen.
        </p>
      </section>

      <section>
        <h2>9. Transaktionale E-Mails</h2>
        <p>
          Für Zugang, Kursabschluss, Zertifikat und sicherheitsrelevante
          Kontoereignisse werden transaktionale E-Mails versendet. Hierfür
          werden insbesondere Empfängeradresse, Vorname, Vorlagentyp,
          Ereigniskennung und Versandstatus verarbeitet.
        </p>
        {released ? (
          <p>
            Der Versand transaktionaler E-Mails wird technisch über Resend
            abgewickelt.
          </p>
        ) : (
          <PlaceholderBlock>
            E-Mail-Dienst, Absenderdomain, Standort, Rechtsgrundlage,
            Auftragsverarbeitung und Löschfristen ergänzen.
          </PlaceholderBlock>
        )}
      </section>

      <section>
        <h2>10. Kontaktanfragen</h2>
        <p>
          Bei einer Kontaktanfrage verarbeiten wir Name, E-Mail-Adresse,
          gewähltes Thema, Nachricht und technische Schutzinformationen. Die
          Angaben werden zur Bearbeitung und Missbrauchsabwehr verwendet und
          anschließend nach den festgelegten Fristen gelöscht, soweit keine
          gesetzlichen Pflichten oder berechtigten Dokumentationsinteressen
          entgegenstehen.
        </p>
      </section>

      <section id="cookie-einstellungen" className="scroll-mt-28">
        <h2>11. Cookies und lokale Speicherung</h2>
        <p>
          Notwendige Cookies oder vergleichbare Speichertechniken können für
          Anmeldung, Sicherheit, Checkout und Sitzungsstatus eingesetzt werden.
          Sie sind für die angeforderte Funktion erforderlich.
        </p>
        <p>
          Die Plattform setzt keine nicht notwendigen Analyse- oder
          Marketing-Cookies ein. Sollten solche Dienste ergänzt werden, dürfen
          sie erst nach wirksamer Einwilligung starten; die Auswahl muss
          jederzeit widerrufbar sein.
        </p>
        <p>
          <strong>Cookie-Einstellungen:</strong> Für die derzeit ausschließlich
          technisch notwendigen Funktionen gibt es keine optionalen Kategorien
          zu aktivieren.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Cookie-Liste mit Name, Anbieter, Zweck, Laufzeit und Kategorie
            ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>12. Sicherheit und Missbrauchsschutz</h2>
        <p>
          Zur Absicherung können fehlgeschlagene Anmeldungen,
          Rate-Limit-Ereignisse, administrative Aktionen, Webhook-Verarbeitung
          und verdächtige Zugriffe protokolliert werden. Protokolle dürfen keine
          Passwörter, vollständigen Zahlungsdaten oder unnötigen
          personenbezogenen Inhalte enthalten.
        </p>
      </section>

      <section>
        <h2>13. Empfänger und Drittlandübermittlungen</h2>
        <p>
          Daten werden nur an technisch oder rechtlich erforderliche Empfänger
          übermittelt, etwa Hosting-, Authentifizierungs-, Datenbank-,
          Zahlungs-, Video-, E-Mail- und Speicherdienste sowie Behörden bei
          gesetzlicher Verpflichtung.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Empfänger, Regionen, Angemessenheitsbeschlüsse oder geeignete
            Garantien vollständig aufführen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>14. Speicherdauer</h2>
        <p>
          Daten werden gelöscht oder anonymisiert, sobald der jeweilige Zweck
          entfällt und keine gesetzlichen Aufbewahrungsfristen, laufenden
          Vertragsansprüche, Sicherheitsinteressen oder Nachweispflichten
          entgegenstehen. Rechnungs- und steuerrelevante Daten können länger
          aufzubewahren sein als das aktive Benutzerkonto.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Konkrete Fristen beziehungsweise nachvollziehbare Kriterien je
            Datenkategorie ergänzen.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>15. Deine Rechte</h2>
        <p>
          Je nach Voraussetzungen bestehen insbesondere Rechte auf Auskunft,
          Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und
          Widerspruch. Eine erteilte Einwilligung kann mit Wirkung für die
          Zukunft widerrufen werden. Außerdem besteht ein Beschwerderecht bei
          einer zuständigen Datenschutzaufsichtsbehörde.
        </p>
        <p>
          Anfragen können über die im Abschnitt „Verantwortliche Stelle“
          genannten Kontaktdaten gestellt werden. Zur sicheren Zuordnung kann
          ein angemessener Identitätsnachweis erforderlich sein.
        </p>
      </section>

      <section>
        <h2>16. Automatisierte Entscheidungen</h2>
        <p>
          Die Quizbewertung erfolgt regelbasiert anhand der abgegebenen
          Antworten. Sie entscheidet über die Freischaltung der nächsten
          Kurslektion, entfaltet aber keine rechtliche oder vergleichbar
          erhebliche Wirkung im datenschutzrechtlichen Sinn. Eine darüber
          hinausgehende automatisierte Entscheidungsfindung ist nicht
          vorgesehen.
        </p>
      </section>

      <section>
        <h2>17. Stand und Änderungen</h2>
        <p>
          Änderungen der Plattform, eingesetzter Anbieter oder
          Verarbeitungszwecke werden in diesen Hinweisen und gegebenenfalls im
          Consent-Management nachgeführt.
        </p>
      </section>
    </LegalDocument>
  );
}
