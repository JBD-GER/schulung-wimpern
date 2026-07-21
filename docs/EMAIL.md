# Transaktionale E-Mail

## DNS und Absender

- eigene Subdomain für Transaktionsmails verwenden
- SPF und DKIM beim Provider vollständig verifizieren
- DMARC zunächst beobachten, danach schrittweise verschärfen
- `EMAIL_FROM` mit erreichbarer Reply-To-/Supportadresse konfigurieren
- keine `noreply`-Adresse verwenden, wenn Antworten unterstützt werden

## Vorlagen und Ereignisse

Die Anwendung unterscheidet Aktivierung, vollständigen Kursabschluss, fertiges
Zertifikat und die gesetzliche Eingangsbestätigung eines elektronischen
Widerrufs. Jede Mail besitzt HTML- und Plain-Text-Inhalt. Der Zertifikatsversand
enthält PDF-Anhang und kurzlebigen Download-Link.

Die Payment-first-Aktivierung enthält zusätzlich die bei Vertragsschluss
festgeschriebene vollständige Vertragsbestätigung als UTF-8-Textanhang. AGB,
Widerrufsbelehrung, ausdrückliche Erklärungen, Anbieter-, Bestell-, Preis- und
Rechnungsdaten werden vor der Kursfreischaltung zusammen mit einer SHA-256-
Prüfsumme atomar am Checkout-Intent gespeichert. Jeder automatische oder
manuelle Retry versendet exakt diese gespeicherten Bytes und prüft vorher die
Prüfsumme.

Die Widerrufsbestätigung verwendet den unveränderlichen Datenbanknachweis als
Quelle und enthält Eingangsnummer, Erklärungstext, Vertragsidentifikation,
Bestätigungsadresse sowie Datum und Uhrzeit in Europe/Berlin und UTC. Ein
erneuter Versand verwendet denselben Event Key und darf keinen neuen
Widerrufsnachweis erzeugen. Einzelheiten stehen in [WIDERRUF.md](WIDERRUF.md).

`email_deliveries.event_key` ist eindeutig. Retries dürfen denselben Event Key nicht als neue fachliche Nachricht behandeln. Provider-ID, Status und minimierte Fehlermeldung werden gespeichert; API-Key, vollständige Payload und Anhang werden nicht geloggt.

## Fehlerbehandlung

- temporärer Providerfehler: idempotenter Retry
- Anhang zu groß: Mail ohne Anhang mit sicherem Download-Link senden und Fehler für Admin sichtbar machen
- permanente Ablehnung: Adminstatus und Supportprozess
- erneuter Adminversand: neuer expliziter Re-Send-Event Key plus Audit Log
- Widerrufsbestätigung: bei einem Providerfehler denselben idempotenten Event
  Key sofort erneut beanspruchen; der bereits gespeicherte Eingang bleibt
  unverändert
- Payment-first-Aktivierung: der Vercel-Cron wiederholt fehlgeschlagene
  Zustellungen mit der gespeicherten Vertragsbestätigung; Profiländerungen
  dürfen Empfänger oder Anhang nicht verändern

## Abnahme

Versand in üblichen Desktop-/Mobile-Clients prüfen, Plain-Text testen, Links auf korrekte HTTPS-Domain prüfen und sicherstellen, dass keine Marketinginhalte ohne gesonderte Einwilligung enthalten sind.
