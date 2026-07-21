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
    title: "Widerrufsbelehrung",
    description:
      "Informationen zum Widerrufsrecht für die Online-Schulung Wimpernverlängerung.",
    draftDescription:
      "Technischer Entwurf der Widerrufsbelehrung für die Online-Schulung Wimpernverlängerung.",
    canonical: "/widerruf",
  });
}

export default function WithdrawalPage() {
  const release = getReleaseContract();
  const released = release.legal.approved;
  const provider = release.legal.releasedProvider ?? release.legal.provider;

  return (
    <LegalDocument
      eyebrow="Verbraucherinformationen"
      title="Widerrufsbelehrung"
      introduction={
        released
          ? "Informationen zum Widerrufsrecht bei der Buchung der Online-Schulung Wimpernverlängerung."
          : "Die finale Belehrung hängt von der rechtlichen Einordnung und Bereitstellung des Onlinekurses ab."
      }
      released={released}
    >
      {!released ? (
        <section>
          <h2>Wichtiger Hinweis zur finalen Fassung</h2>
          <p>
            Ein betreuter Onlinekurs kann rechtlich anders zu behandeln sein als
            ausschließlich bereitgestellte digitale Inhalte. Deshalb darf die
            folgende Struktur nicht unverändert als abschließende
            Widerrufsbelehrung verwendet werden.
          </p>
          <p>
            Vor dem Livegang sind Vertragsgegenstand, Leistungsbeginn, die
            unbefristete Bereitstellung des Kurszugangs, gegebenenfalls
            persönliche Leistungen und die technischen Einwilligungsnachweise
            durch qualifizierte Rechtsberatung zu prüfen.
          </p>
        </section>
      ) : null}

      <section>
        <h2>Widerrufsrecht</h2>
        <p>
          Verbraucherinnen steht bei einem Fernabsatzvertrag grundsätzlich ein
          gesetzliches Widerrufsrecht zu. Die regelmäßige Widerrufsfrist beträgt
          14 Tage und beginnt bei einem Vertrag über Dienstleistungen oder
          digitale Inhalte grundsätzlich mit Vertragsschluss, soweit die
          gesetzlichen Informationsanforderungen erfüllt sind.
        </p>
        {released ? (
          <ProviderAddress provider={provider} showContact />
        ) : (
          <PlaceholderBlock>
            Abgestimmte Widerrufsbelehrung mit vollständigem Anbieter,
            Anschrift, E-Mail und – falls erforderlich – elektronischer
            Widerrufsfunktion einsetzen.
          </PlaceholderBlock>
        )}
      </section>

      <section>
        <h2>Ausübung des Widerrufs</h2>
        <p>
          Der Entschluss zum Widerruf muss gegenüber dem Anbieter eindeutig
          erklärt werden; eine Begründung ist nicht erforderlich. Zur
          Fristwahrung genügt grundsätzlich die rechtzeitige Absendung.
        </p>
        {released ? (
          <ProviderAddress provider={provider} showContact />
        ) : (
          <PlaceholderBlock>
            Anbieteranschrift, E-Mail und – sofern gesetzlich erforderlich – URL
            und Funktionsweise der elektronischen Widerrufsfunktion ergänzen.
          </PlaceholderBlock>
        )}
      </section>

      <section>
        <h2>Beginn vor Ablauf der Widerrufsfrist</h2>
        <p>
          {released
            ? "Der Checkout enthält eine gesonderte, nicht vorausgewählte Erklärung für den ausdrücklich gewünschten vorzeitigen Leistungsbeginn. Die Erklärung wird getrennt von der AGB-Bestätigung mit Zeitstempel, Textversion und Bestellbezug gespeichert."
            : "Der Checkout soll eine gesonderte, nicht vorausgewählte Erklärung für den ausdrücklich gewünschten vorzeitigen Leistungsbeginn enthalten. Die Erklärung muss vom Akzeptieren der AGB getrennt und mit Zeitstempel, Textversion und Bestellbezug nachweisbar gespeichert werden."}
        </p>
        <p>
          Bei nicht auf einem körperlichen Datenträger bereitgestellten
          digitalen Inhalten setzt ein mögliches Erlöschen unter anderem den
          Beginn der Vertragserfüllung, ausdrückliche Zustimmung, bestätigte
          Kenntnis des Verlusts und eine Vertragsbestätigung auf dauerhaftem
          Datenträger voraus. Bei Dienstleistungen gelten andere
          Voraussetzungen, insbesondere erlischt das Recht nicht allein durch
          den Beginn, sondern regelmäßig erst mit vollständiger Leistung unter
          den gesetzlichen Voraussetzungen.
        </p>
        {!released ? (
          <PlaceholderBlock>
            Checkbox- und Bestätigungstext passend zum eingeordneten
            Vertragsmodell rechtlich freigeben.
          </PlaceholderBlock>
        ) : null}
      </section>

      <section>
        <h2>Folgen des Widerrufs</h2>
        {released ? (
          <p>
            Für Rückzahlung, Fristen und einen möglichen Wertersatz gelten die
            in der bestätigten Belehrung beschriebenen Voraussetzungen.
          </p>
        ) : (
          <>
            <p>
              Die Rechtsfolgen – insbesondere Rückzahlung, Fristen und ein
              möglicher Wertersatz für bis zum Widerruf erbrachte
              Dienstleistungen – sind anhand des finalen Leistungsmodells und
              der ordnungsgemäßen Vorabinformation zu formulieren. Für
              widerrufene digitale Inhalte gelten abweichende Regeln.
            </p>
            <PlaceholderBlock>
              Geprüfte Rechtsfolgen und Zahlungsmittel der Rückzahlung ergänzen.
            </PlaceholderBlock>
          </>
        )}
      </section>

      <section>
        <h2>Muster-Widerrufsformular</h2>
        <p>
          Wenn du den Vertrag widerrufen möchtest, kannst du dieses Muster
          verwenden.
          {!released
            ? " Die Anbieterangaben müssen vor Veröffentlichung ergänzt werden."
            : null}
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-ivory p-5 text-sm leading-7 text-ink/80">
          {released ? (
            <>
              <p>An:</p>
              <ProviderAddress provider={provider} showContact />
            </>
          ) : (
            <p>An [Name/Firma, Anschrift und E-Mail des Anbieters]:</p>
          )}
          <p className="mt-3">
            Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die
            Online-Schulung Wimpernverlängerung.
          </p>
          <ul className="mt-3">
            <li>Bestellt am: ____________________</li>
            <li>Name: __________________________</li>
            <li>Anschrift: ______________________</li>
            <li>E-Mail des Kontos: ______________</li>
            <li>Datum: _________________________</li>
          </ul>
          <p className="mt-3">
            Unterschrift (nur bei Mitteilung auf Papier): ____________________
          </p>
        </div>
      </section>

      <section>
        <h2>
          {released
            ? "Gesetzliche Grundlagen"
            : "Amtliche Grundlagen für die Prüfung"}
        </h2>
        <p>
          Maßgeblich bleiben die zum Zeitpunkt des Vertragsschlusses geltenden
          Vorschriften zum Widerruf bei Dienstleistungen beziehungsweise
          digitalen Inhalten.
        </p>
        <ul>
          <li>
            <a
              href="https://www.gesetze-im-internet.de/bgb/__355.html"
              rel="noreferrer"
            >
              § 355 BGB – Widerrufsrecht bei Verbraucherverträgen
            </a>
          </li>
          <li>
            <a
              href="https://www.gesetze-im-internet.de/bgb/__356.html"
              rel="noreferrer"
            >
              § 356 BGB – Fernabsatzverträge und digitale Inhalte
            </a>
          </li>
          <li>
            <a
              href="https://www.gesetze-im-internet.de/bgb/__312f.html"
              rel="noreferrer"
            >
              § 312f BGB – Vertragsbestätigung
            </a>
          </li>
        </ul>
      </section>
    </LegalDocument>
  );
}
