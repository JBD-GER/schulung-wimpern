import type { Metadata } from "next";

import {
  LegalDocument,
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
      "Technisch vollständiger Entwurf der Datenschutzerklärung für die Schulung Wimpernverlängerung.",
    canonical: "/datenschutz",
  });
}

export default function PrivacyPage() {
  const release = getReleaseContract();
  const provider = release.legal.releasedProvider ?? release.legal.provider;

  return (
    <LegalDocument
      eyebrow="Datenschutz"
      title="Datenschutzerklärung"
      introduction="Diese Hinweise erklären, welche personenbezogenen Daten auf der öffentlichen Website, beim Checkout und in der persönlichen Lernplattform verarbeitet werden."
    >
      <section>
        <h2>1. Verantwortliche Stelle</h2>
        <ProviderAddress provider={provider} showContact />
        <p>
          Für Datenschutzanfragen kannst du die oben genannte E-Mail-Adresse
          verwenden. Ein Datenschutzbeauftragter ist nicht benannt, sofern auf
          dieser Seite keine gesonderten Kontaktdaten veröffentlicht sind.
        </p>
      </section>

      <section>
        <h2>2. Überblick und Rechtsgrundlagen</h2>
        <p>
          Wir verarbeiten Daten nur für die Bereitstellung und Absicherung der
          Website, die Zahlungsabwicklung, die Vertragserfüllung, den
          Kursfortschritt, Wissenstests, Zertifikate, Support sowie die
          Erfüllung gesetzlicher Pflichten.
        </p>
        <ul>
          <li>
            Art. 6 Abs. 1 Buchst. b DSGVO für vorvertragliche Maßnahmen,
            Checkout, Konto, Kurszugang und Vertragserfüllung,
          </li>
          <li>
            Art. 6 Abs. 1 Buchst. c DSGVO für handels- und steuerrechtliche
            Aufbewahrungs- und Nachweispflichten,
          </li>
          <li>
            Art. 6 Abs. 1 Buchst. f DSGVO für stabilen Betrieb, IT-Sicherheit,
            Missbrauchs- und Betrugsabwehr sowie die Geltendmachung oder Abwehr
            von Ansprüchen und
          </li>
          <li>
            Art. 6 Abs. 1 Buchst. a DSGVO in Verbindung mit § 25 Abs. 1 TDDDG
            für die freiwillige anonyme Webstatistik.
          </li>
        </ul>
        <p>
          Soweit Angaben für Vertragsschluss oder Leistungserbringung benötigt
          werden, ist die Bereitstellung erforderlich. Ohne diese Angaben kann
          die Buchung oder der jeweilige Dienst nicht ausgeführt werden.
        </p>
      </section>

      <section>
        <h2>3. Websiteaufruf und Hosting über Vercel</h2>
        <p>
          Die Anwendung wird über Vercel bereitgestellt. Beim Seitenaufruf
          werden technisch notwendige Verbindungsdaten verarbeitet, zum Beispiel
          IP-Adresse, Zeitpunkt, angeforderte Ressource, Referrer-Information,
          Browser- und Geräteinformationen sowie Sicherheitsereignisse. Das ist
          erforderlich, um Inhalte auszuliefern, Fehler zu beheben und Angriffe
          abzuwehren. Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. f DSGVO.
        </p>
        <p>
          Empfänger ist Vercel Inc., USA, einschließlich eingesetzter
          Unterauftragnehmer. Soweit Daten außerhalb des Europäischen
          Wirtschaftsraums verarbeitet werden, stützt sich die Übermittlung auf
          die jeweils anwendbaren Garantien nach Kapitel V DSGVO, insbesondere
          Angemessenheitsbeschlüsse oder EU-Standardvertragsklauseln. Weitere
          Informationen findest du in den{" "}
          <a href="https://vercel.com/legal/privacy-policy">
            Datenschutzhinweisen von Vercel
          </a>
          .
        </p>
      </section>

      <section>
        <h2>4. Checkout vor der Zahlung</h2>
        <p>
          Im Checkout verarbeiten wir Vor- und Nachname, E-Mail-Adresse,
          Rechnungs- und Bestelldaten, den gewählten Preis, die dokumentierten
          rechtlichen Bestätigungen sowie für eine neue Buchung einen
          Einweg-Hash des gewählten Passworts. Das Klartextpasswort wird nur
          kurzfristig zur Bildung dieses bcrypt-Hashs verarbeitet und nicht
          gespeichert. Vor einer bestätigten Zahlung werden diese Angaben
          ausschließlich als befristeter Checkout-Vorgang geführt. Für einen
          abgebrochenen, fehlgeschlagenen oder abgelaufenen Checkout wird kein
          Teilnehmerkonto, keine bezahlte Bestellung und keine Kurseinschreibung
          angelegt.
        </p>
        <p>
          Eine zusätzliche E-Mail-Bestätigung vor der Zahlung ist nicht
          erforderlich. Ist die Adresse bereits registriert, muss stattdessen
          das bestehende Konto angemeldet sein. Zusätzlich verwenden wir einen
          zufälligen, im Browser gespeicherten Checkout-Nachweis. Dieser
          Browser-Nachweis enthält weder Passwort noch Zahlungsdaten.
          Rechtsgrundlagen sind Art. 6 Abs. 1 Buchst. b und f DSGVO.
        </p>
      </section>

      <section>
        <h2>5. Konto, Datenbank und Dateispeicher über Supabase</h2>
        <p>
          Erst nach bestätigter Zahlung wird ein Teilnehmerkonto angelegt oder
          das vor der Zahlung angemeldete bestehende Konto verwendet.
          Verarbeitet werden insbesondere Name, E-Mail-Adresse, Konto- und
          Sitzungskennungen, Verifizierungsstatus, Bestellzuordnung,
          Einschreibung, Kursfortschritt und private Dateireferenzen. Der
          temporäre Passwort-Hash einer neuen Buchung wird nach erfolgreicher
          Kontoanlage aus dem Checkout-Vorgang entfernt; Supabase speichert
          Passwörter ebenfalls ausschließlich als kryptografische Hashs.
        </p>
        <p>
          Authentifizierung, Datenbank und privater Dateispeicher werden über
          Supabase Inc., USA, bereitgestellt. Das Supabase-Projekt ist in der
          Region eu-central-1 (Frankfurt) angelegt. Zugriffe von Supabase und
          Unterauftragnehmern außerhalb des EWR können dennoch nicht vollständig
          ausgeschlossen werden; hierfür gelten die anwendbaren
          Übermittlungsinstrumente nach Kapitel V DSGVO. Weitere Informationen:{" "}
          <a href="https://supabase.com/privacy">Datenschutz bei Supabase</a>.
        </p>
      </section>

      <section>
        <h2>6. Zahlung, Betrugsprävention und Rechnung über Stripe</h2>
        <p>
          Die Zahlungsoberfläche wird erst geladen, wenn du den Zahlungsschritt
          aktiv aufrufst. Stripe verarbeitet dabei je nach Zahlungsart Name,
          E-Mail-Adresse, Rechnungsanschrift, Steuerangaben, IP-Adresse, Geräte-
          und Betrugssignale sowie die eigentlichen Zahlungsdaten. Vollständige
          Karten- oder Kontodaten werden nicht auf unseren Servern gespeichert.
        </p>
        <p>
          Wir erhalten und speichern die für Vertrag, Freischaltung,
          Rückerstattung und Rechnung nötigen Referenzen und Statusdaten,
          insbesondere Stripe-Kunden-, Checkout-, Zahlungs- und
          Rechnungskennungen, Preis, Betrag, Währung und Steuerbetrag. Eine
          Kurseinschreibung erfolgt ausschließlich nach einem von Stripe
          signierten, serverseitig geprüften Zahlungsereignis.
        </p>
        <p>
          Empfänger ist für Kundinnen im EWR regelmäßig Stripe Payments Europe,
          Limited, Irland, mit Unternehmen der Stripe-Gruppe und
          Unterauftragnehmern. Stripe verarbeitet bestimmte Daten, insbesondere
          zur gesetzlichen Compliance und Betrugsprävention, auch in eigener
          Verantwortlichkeit. Rechtsgrundlagen sind Art. 6 Abs. 1 Buchst. b, c
          und f DSGVO. Informationen zu internationalen Übermittlungen und
          eigenen Verarbeitungen enthält das{" "}
          <a href="https://stripe.com/de/privacy">Stripe Privacy Center</a>.
        </p>
      </section>

      <section>
        <h2>7. Kursnutzung, Videofortschritt und Wissenstests</h2>
        <p>
          Für den Lernpfad verarbeiten wir Einschreibung, Kursversion,
          freigeschaltete Lektionen, die höchste erreichte Videoposition,
          Fortschrittszeitpunkte, Testversuche, abgegebene Antworten und
          Ergebnisse. Das Vorspulen ist möglich; die erreichte Position kann
          deshalb den Fortschritt erhöhen. Ab 90 Prozent wird der zugehörige
          Wissenstest freigeschaltet. Nach bestandenem Test wird die nächste
          Lektion freigegeben.
        </p>
        <p>
          Die Daten dienen der Vertragserfüllung nach Art. 6 Abs. 1 Buchst. b
          DSGVO und sind ausschließlich dem jeweiligen Konto sowie besonders
          berechtigten Administratorinnen zugänglich. Richtige Lösungsschlüssel
          werden vor einer Abgabe nicht an den Browser übertragen.
        </p>
      </section>

      <section>
        <h2>8. Geschützte Videos über Cloudflare Stream</h2>
        <p>
          Die Videos werden über Cloudflare Stream ausgeliefert. Vor der
          Wiedergabe prüfen wir Konto, Kurszugang und Freischaltung und erzeugen
          einen kurzlebigen, signierten Zugriff. Cloudflare kann dabei
          insbesondere IP-Adresse, Geräte- und Browserdaten, Video- und
          Tokenkennung sowie Wiedergabe- und Sicherheitsdaten verarbeiten.
        </p>
        <p>
          Empfänger ist Cloudflare Inc., USA, einschließlich verbundener
          Unternehmen und Unterauftragnehmer. Die Auslieferung erfolgt über ein
          globales Netzwerk; deshalb können Verarbeitungen außerhalb des EWR
          stattfinden. Rechtsgrundlagen sind Art. 6 Abs. 1 Buchst. b und f
          DSGVO. Es gelten die geeigneten Garantien des Cloudflare-DPA.
          Ergänzend gelten die{" "}
          <a href="https://www.cloudflare.com/privacypolicy/">
            Datenschutzhinweise von Cloudflare
          </a>
          .
        </p>
      </section>

      <section>
        <h2>9. Abschluss und Zertifikat</h2>
        <p>
          Nach erfolgreichem Abschluss verarbeiten wir den von dir bestätigten
          Zertifikatsnamen, Kurs und Kursversion, Ausstellungsdatum,
          Zertifikatsnummer, Dateireferenz und technische Prüfsumme. Das private
          PDF wird nur einmal erzeugt und danach inhaltlich nicht automatisch
          verändert. Eine spätere Korrektur muss gesondert geprüft werden.
        </p>
        <p>
          Auf der öffentlichen Zertifikatsprüfung werden nur Gültigkeitsstatus,
          Kursname, Ausstellungsdatum und Zertifikatsnummer angezeigt. Ein
          vollständiger Name wird dort nur angezeigt, wenn dafür eine gesonderte
          wirksame Einwilligung vorliegt.
        </p>
      </section>

      <section>
        <h2>10. Transaktionale E-Mails und Kontakt</h2>
        <p>
          Bei Nutzung der elektronischen Widerrufsfunktion verarbeiten wir
          Namen, Vertragsidentifikation, Bestätigungs-E-Mail, den verbindlichen
          Erklärungstext, Eingangszeit, Eingangsnummer und einen technischen
          Integritätsnachweis. Der Eingang wird unveränderbar dokumentiert und
          unmittelbar per E-Mail bestätigt. Rechtsgrundlage ist Art. 6 Abs. 1
          Buchst. c DSGVO in Verbindung mit den gesetzlichen Pflichten zur
          elektronischen Widerrufsfunktion; ergänzend Art. 6 Abs. 1 Buchst. f
          DSGVO für den Nachweis und die Abwehr von Missbrauch.
        </p>
        <p>
          Für Verifizierung, Zugang, Zahlungs- und Bestellinformationen,
          Kursabschluss, Zertifikat, Widerrufsbestätigung sowie
          sicherheitsrelevante Kontoereignisse verarbeiten wir Empfängeradresse,
          Namen, Vorlagentyp, notwendigen Nachrichteninhalt, Ereigniskennungen
          und Zustellstatus. Der Versand erfolgt über Plus Five Five, Inc.
          (Resend), USA. Für Übermittlungen gelten insbesondere
          Angemessenheitsmechanismen und EU-Standardvertragsklauseln gemäß dem
          Resend-DPA. Weitere Informationen:{" "}
          <a href="https://resend.com/legal/privacy-policy">
            Datenschutzhinweise von Resend
          </a>
          .
        </p>
        <p>
          Bei Kontaktanfragen verarbeiten wir Name, E-Mail-Adresse, Thema,
          Nachricht und notwendige Schutzinformationen. Rechtsgrundlage ist Art.
          6 Abs. 1 Buchst. b DSGVO bei vertragsbezogenen Anliegen, ansonsten
          Art. 6 Abs. 1 Buchst. f DSGVO. Wir verwenden keine Öffnungs- oder
          Klickmessung für Werbe-E-Mails.
        </p>
        <p>
          Eine Einwilligung in optionale Schulungs-Neuigkeiten kann erst nach
          der Buchung im Profil erteilt und dort jederzeit widerrufen werden.
          Dafür speichern wir E-Mail-Adresse, Einwilligungsstatus, Textversion
          und Zeitpunkt auf Grundlage von Art. 6 Abs. 1 Buchst. a DSGVO. Ein
          Versand würde über Resend erfolgen. Die Adresse wird nach Widerruf
          nicht mehr für solche Nachrichten verwendet; der Nachweis der
          Einwilligung beziehungsweise ihres Widerrufs wird nur für die Dauer
          möglicher Nachweispflichten aufbewahrt. Im Checkout wird keine
          Newsletter-Einwilligung abgefragt und die Entscheidung wird nicht an
          Vercel Analytics übermittelt.
        </p>
      </section>

      <section>
        <h2>11. Freiwillige Webstatistik über Vercel Web Analytics</h2>
        <p>
          Wenn du zustimmst, laden wir Vercel Web Analytics für aggregierte
          Statistiken der öffentlichen Seiten. Verarbeitet werden können
          Zeitpunkt, gekürzter Seitenpfad ohne Query-Parameter oder Fragment,
          Referrer, grobe Region, Gerätetyp, Betriebssystem, Browser und anonyme
          Ereignisnamen im Buchungsablauf. Namen, E-Mail-Adressen, Bestell- oder
          Zertifikatsnummern werden nicht als Ereigniswerte übermittelt.
        </p>
        <p>
          Automatische Aufrufe von Admin-, Dashboard-, Profil-, Kurs-,
          Zertifikats-, Checkout-, Zahlungsbestätigungs- und Anmeldeseiten sind
          technisch ausgeschlossen. Vercel Analytics verwendet keine
          Drittanbieter-Cookies; eine aus der Anfrage gebildete Besucherkennung
          wird nach Angaben von Vercel nach 24 Stunden verworfen. Die
          Verarbeitung startet ausschließlich nach Einwilligung gemäß Art. 6
          Abs. 1 Buchst. a DSGVO und § 25 Abs. 1 TDDDG. Du kannst sie unter{" "}
          <a href="/cookie-einstellungen">Cookie-Einstellungen</a> jederzeit mit
          Wirkung für die Zukunft widerrufen.
        </p>
      </section>

      <section>
        <h2>12. Freiwillige Google-Ads-Conversion-Messung</h2>
        <p>
          Wenn du gesondert zustimmst, laden wir das Google-Tag von Google
          Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Wir
          messen damit ausschließlich, ob der Stripe-Zahlungsbereich tatsächlich
          geladen wurde und ob eine Bestellung nach serverseitiger
          Zahlungsbestätigung erfolgreich war. Beim Kauf übermitteln wir den
          Bestellwert, die Währung und eine zufällige technische Bestellkennung
          zur Vermeidung von Doppelzählungen. Namen, E-Mail-Adressen,
          Rechnungsanschriften und Zahlungsdaten werden von uns nicht als
          Conversion-Werte an Google übergeben.
        </p>
        <p>
          Die Verarbeitung und der Zugriff auf optionale Speicherungen beginnen
          ausschließlich nach deiner Einwilligung gemäß Art. 6 Abs. 1 Buchst. a
          DSGVO und § 25 Abs. 1 TDDDG. Personalisierte Werbung, Remarketing und
          Google-Signale bleiben in unserer Einbindung deaktiviert. Google kann
          dennoch technische Nutzungs-, Geräte-, Browser-, Referrer- und
          Anzeigenklickdaten verarbeiten und Daten in Drittländer übermitteln;
          hierfür gelten die von Google eingesetzten Garantien. Weitere
          Informationen findest du in den{" "}
          <a href="https://policies.google.com/privacy">
            Datenschutzhinweisen von Google
          </a>
          . Du kannst die Einwilligung unter{" "}
          <a href="/cookie-einstellungen">Cookie-Einstellungen</a> jederzeit mit
          Wirkung für die Zukunft widerrufen.
        </p>
      </section>

      <section id="cookie-einstellungen" className="scroll-mt-28">
        <h2>13. Cookies und vergleichbare Speicherungen</h2>
        <p>
          Wir setzen nur die folgenden eigenen notwendigen Speicherungen ein.
          Optionale Statistik und Conversion-Messung werden getrennt durch die
          gespeicherte Auswahl gesteuert; Vercel Web Analytics selbst setzt
          dabei keine Drittanbieter-Cookies.
        </p>
        <ul>
          <li>
            <strong>swv_consent</strong> (eigene Domain): speichert Version und
            Auswahl für Statistik und Conversion-Messung für 180 Tage;
            notwendig, damit die Auswahl umgesetzt und nicht bei jedem Aufruf
            erneut abgefragt wird.
          </li>
          <li>
            <strong>swv_consent_id</strong> (eigene Domain, HttpOnly): zufällige
            Kennung zum Nachweis der Auswahl für 400 Tage; enthält keine
            Klardaten.
          </li>
          <li>
            <strong>Supabase-Sitzungscookies (sb-…-auth-token)</strong>:
            Zugangs- und Erneuerungstoken für die Anmeldung. Sie werden erst
            nach erfolgreicher Zahlung oder einer aktiven Anmeldung gesetzt und
            von Supabase entsprechend der gültigen Sitzung erneuert. Sie enden
            bei Abmeldung, sicherheitsbedingter Beendigung oder Ablauf der
            serverseitigen Sitzung.
          </li>
          <li>
            <strong>swv_checkout_intent</strong> (eigene Domain, HttpOnly):
            bindet den Browser an den vorbereiteten Checkout und ermöglicht nach
            bestätigter Zahlung die sichere einmalige Anmeldung. Er verfällt mit
            dem Checkout, spätestens nach 48 Stunden, oder wird nach Verbrauch
            gelöscht.
          </li>
          <li>
            <strong>swv-recovery-verification</strong> (eigene Domain,
            HttpOnly): einmaliger Nachweis zum sicheren Setzen eines neuen
            Passworts nach einer bestätigten Wiederherstellungs-E-Mail; Laufzeit
            zehn Minuten.
          </li>
          <li>
            <strong>_gcl_*</strong> (eigene Domain, durch Google gesetzt): kann
            nach Einwilligung Informationen zu einem Anzeigenklick und dessen
            Zuordnung zu einer Conversion speichern. Die konkrete Laufzeit wird
            von Google gesteuert und beträgt typischerweise bis zu 90 Tage. Bei
            Widerruf laden wir das Google-Tag nicht weiter und löschen
            zugängliche _gcl_-Speicherungen soweit technisch möglich.
          </li>
        </ul>
        <p>
          Im aktiv geöffneten Zahlungsschritt kann Stripe notwendige
          Betrugspräventions- und Zahlungsspeicherungen setzen, insbesondere
          <strong> __stripe_mid</strong> (bis zu ein Jahr),
          <strong> __stripe_sid</strong> (etwa 30 Minuten) und
          <strong> m</strong> (bis zu zwei Jahre) sowie je nach Zahlungsart
          weitere notwendige Stripe-/Link- oder 3-D-Secure-Speicherungen. Diese
          werden von Stripe gesteuert. Die aktuelle Liste findest du in den{" "}
          <a href="https://stripe.com/cookie-settings">
            Cookie-Einstellungen von Stripe
          </a>
          .
        </p>
        <p>
          Notwendige Speicherungen beruhen auf § 25 Abs. 2 Nr. 2 TDDDG; die
          anschließende Datenverarbeitung auf den jeweils oben genannten
          Rechtsgrundlagen. Die optionale Google-Ads-Conversion-Messung beruht
          ausschließlich auf Einwilligung; Remarketing-, personalisierte Werbe-
          und Social-Media-Pixel sind nicht eingebunden.
        </p>
      </section>

      <section>
        <h2>14. Empfänger und internationale Übermittlungen</h2>
        <p>
          Empfänger sind nur Personen und Dienstleister, die Daten für Betrieb,
          Vertrag oder gesetzliche Pflichten benötigen: Vercel für Hosting,
          Supabase für Authentifizierung, Datenbank und Speicher, Stripe für
          Zahlung und Rechnung, Cloudflare für Videoauslieferung und Resend für
          transaktionale E-Mails sowie – ausschließlich nach Einwilligung –
          Google für die Conversion-Messung. Behörden, Gerichte, Steuerberatung
          oder Rechtsberatung erhalten Daten nur, soweit eine Verpflichtung oder
          ein konkreter Bedarf besteht.
        </p>
        <p>
          Soweit ein Dienstleister Auftragsverarbeiter ist, erfolgt die
          Verarbeitung auf Grundlage eines Vertrags nach Art. 28 DSGVO. Bei
          Drittlandübermittlungen werden – je nach Empfänger und aktueller
          Zertifizierung – Angemessenheitsbeschlüsse, einschließlich des
          EU-US-Datenschutzrahmens, und/oder EU-Standardvertragsklauseln mit
          ergänzenden Maßnahmen eingesetzt. Die jeweiligen
          Unterauftragnehmerlisten der Anbieter können sich ändern.
        </p>
      </section>

      <section>
        <h2>15. Speicherdauer</h2>
        <ul>
          <li>
            Abgebrochene, fehlgeschlagene oder abgelaufene Checkout-Daten werden
            nicht für eine Kontoanlage genutzt. Vorläufige Stripe-Kundendaten
            werden bei einem bestätigten manuellen Abbruch möglichst sofort
            gelöscht. Bei Ablauf oder einem fehlgeschlagenen Checkout bereinigt
            ein geschützter Wiederholungslauf den vorläufigen Stripe-Kunden nach
            erneuter Prüfung des Stripe-Zahlungsstatus und immer vor der lokalen
            Löschung. Der lokale Checkout-Vorgang wird 30 Tage nach Ablauf
            automatisiert gelöscht; damit wird auch ein nur für diesen Vorgang
            gespeicherter Passwort-Hash gelöscht. Bei erfolgreicher Kontoanlage
            wird dieser Hash bereits im Rahmen der Freischaltung aus dem
            Checkout-Vorgang entfernt. Stripe kann davon unabhängig Daten weiter
            speichern, soweit Stripe sie in eigener Verantwortlichkeit für
            gesetzliche Pflichten, Sicherheit oder Betrugsabwehr benötigt.
            Bezahlte Bestellnachweise sind hiervon ausgenommen.
          </li>
          <li>
            Konto-, Kurs-, Fortschritts- und Zertifikatsdaten werden wegen des
            vertraglich unbefristeten Kurszugangs grundsätzlich für die Dauer
            des Kontos und Vertragsverhältnisses gespeichert. Gesetzliche
            Löschungsansprüche bleiben unberührt.
          </li>
          <li>
            Rechnungen und Buchungsbelege werden regelmäßig acht Jahre ab Ende
            des maßgeblichen Kalenderjahres aufbewahrt (§ 14b UStG, § 147 AO),
            bei im Einzelfall längeren gesetzlichen Fristen entsprechend länger.
          </li>
          <li>
            Kontakt- und Supportdaten werden gelöscht, wenn das Anliegen
            erledigt ist und keine Vertrags-, Nachweis- oder
            Verjährungsinteressen entgegenstehen.
          </li>
          <li>
            Sicherheits-, Admin- und Webhook-Protokolle werden nur so lange
            aufbewahrt, wie sie für Nachvollziehbarkeit, Missbrauchsabwehr und
            gesetzliche Nachweise erforderlich sind.
          </li>
          <li>
            Einwilligungsnachweise werden für die Dauer ihrer Gültigkeit und
            danach so lange gespeichert, wie der Nachweis einer wirksamen
            Auswahl erforderlich sein kann.
          </li>
          <li>
            Conversion-Daten werden bei Google entsprechend der
            Google-Ads-Kontoeinstellungen und gesetzlichen Pflichten
            gespeichert. Die technische Bestellkennung bleibt bei uns als Teil
            des notwendigen Bestellnachweises erhalten.
          </li>
          <li>
            Nachweise elektronischer Widerrufe bleiben unverändert gespeichert,
            solange sie für Rückabwicklung, gesetzliche Dokumentation oder die
            Geltendmachung, Ausübung oder Verteidigung von Ansprüchen
            erforderlich sind.
          </li>
        </ul>
        <p>
          Anstelle einer Löschung kann eine Sperrung treten, wenn Daten nur noch
          zur Erfüllung zwingender Aufbewahrungs- oder Nachweispflichten
          verarbeitet werden dürfen.
        </p>
      </section>

      <section>
        <h2>16. Sicherheit und Zugriffsprotokolle</h2>
        <p>
          Wir verwenden rollenbasierte Zugriffe, Zeilenberechtigungen in der
          Datenbank, verschlüsselte Übertragung, kurzlebige Videozugriffe,
          signaturgeprüfte Stripe-Webhooks, Rate-Limits und Protokolle für
          besonders schutzbedürftige Aktionen. Normale Teilnehmerkonten erhalten
          keine Adminrolle und sehen keine Adminnavigation. Protokolle enthalten
          keine Klartextpasswörter oder vollständigen Zahlungsdaten.
        </p>
      </section>

      <section>
        <h2>17. Deine Rechte</h2>
        <p>
          Bei Vorliegen der gesetzlichen Voraussetzungen hast du das Recht auf
          Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) sowie
          Widerspruch (Art. 21). Eine Einwilligung kannst du jederzeit für die
          Zukunft widerrufen. Die Rechtmäßigkeit der Verarbeitung bis zum
          Widerruf bleibt unberührt.
        </p>
        <p>
          Für Anfragen nutze bitte die Kontaktdaten in Abschnitt 1 oder – nach
          Anmeldung – die Datenschutzfunktionen im Profil. Zum Schutz deiner
          Daten kann ein angemessener Identitätsnachweis erforderlich sein.
        </p>
      </section>

      <section>
        <h2>18. Widerspruch gegen berechtigte Interessen</h2>
        <p>
          Soweit eine Verarbeitung auf Art. 6 Abs. 1 Buchst. f DSGVO beruht,
          kannst du aus Gründen, die sich aus deiner besonderen Situation
          ergeben, jederzeit widersprechen. Wir verarbeiten die betroffenen
          Daten dann nicht weiter, sofern keine zwingenden schutzwürdigen Gründe
          oder die Geltendmachung, Ausübung oder Verteidigung von
          Rechtsansprüchen überwiegen.
        </p>
      </section>

      <section>
        <h2>19. Automatisierte Entscheidungen</h2>
        <p>
          Wissenstests werden regelbasiert anhand der abgegebenen Antworten
          ausgewertet und steuern den Lernpfad. Diese Auswertung hat keine
          rechtliche oder ähnlich erhebliche Wirkung im Sinne von Art. 22 DSGVO.
          Eine darüber hinausgehende ausschließlich automatisierte
          Entscheidungsfindung oder Profiling findet nicht statt.
        </p>
      </section>

      <section>
        <h2>20. Beschwerderecht</h2>
        <p>
          Du kannst dich nach Art. 77 DSGVO bei einer
          Datenschutzaufsichtsbehörde beschweren. Für Verantwortliche in
          Niedersachsen ist insbesondere der Landesbeauftragte für den
          Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, zuständig.
          Das{" "}
          <a href="https://www.lfd.niedersachsen.de/beschwerde">
            Online-Beschwerdeformular
          </a>{" "}
          ist auf der Website der Behörde verfügbar.
        </p>
      </section>

      <section>
        <h2>21. Stand und Änderungen</h2>
        <p>
          Stand: 21. Juli 2026. Wir aktualisieren diese Hinweise, wenn sich
          Funktionen, Anbieter oder Rechtsgrundlagen wesentlich ändern. Eine
          neue optionale Verarbeitung wird nicht ohne die erforderliche erneute
          Einwilligung gestartet.
        </p>
      </section>
    </LegalDocument>
  );
}
