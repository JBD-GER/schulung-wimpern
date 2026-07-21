# Elektronische Widerrufsfunktion

Die öffentliche Funktion unter `/widerruf#vertrag-widerrufen` setzt den
zweistufigen Ablauf nach § 356a BGB technisch um. Sie ersetzt keine fachliche
Prüfung, ob das Widerrufsrecht im konkreten Vertrag besteht oder bereits
erloschen ist. Der Eingang der Erklärung darf deshalb nicht automatisch als
Rückerstattungsentscheidung behandelt werden.

## Ablauf

1. Die Verbraucherin gibt ohne Login Name, Vertragsidentifikation und die
   E-Mail-Adresse für die Eingangsbestätigung ein.
2. Eine Prüfansicht zeigt alle Angaben und den vollständigen Erklärungstext.
3. Nur der eindeutig beschriftete Button `Widerruf bestätigen` sendet die
   Erklärung ab.
4. Der Server prüft Same-Origin, JSON-Schema und zwei Rate-Limit-Buckets.
5. Die Datenbankfunktion `record_electronic_withdrawal` erzeugt atomar einen
   unveränderbaren Nachweis samt Datenbankzeit, Eingangsnummer, kanonischem
   JSON-Dokument und SHA-256-Prüfsumme.
6. Resend versendet unmittelbar eine Eingangsbestätigung mit Inhalt, Datum und
   Uhrzeit. Erst nach bestätigtem E-Mail-Versand zeigt die Oberfläche den
   vollständigen Erfolg an.

Ein Browser erzeugt pro Erklärung eine zufällige Submission-ID. In der
Datenbank wird nur deren SHA-256-Wert gespeichert. Ein Retry mit derselben ID
liefert ausschließlich den ursprünglichen Nachweis zurück; abweichender Inhalt
wird abgelehnt. Dadurch erzeugen verlorene HTTP-Antworten oder E-Mail-Retries
keine zweite Erklärung.

## Datenbank und Unveränderlichkeit

Migration `202607210011_electronic_withdrawal_function.sql` erstellt
`public.withdrawal_requests`. Für `anon` und `authenticated` bestehen weder
Tabellen- noch Funktionsrechte. Die Anwendung schreibt ausschließlich mit der
Service Role über die Security-Definer-Funktion. Ein Trigger lehnt jedes
`UPDATE` und `DELETE` ab; die Service Role erhält auf der Tabelle nur
Leserechte.

Die fachliche Bearbeitung, Zuordnung zu einer Stripe-Bestellung,
Zugangsänderung und Rückzahlung sind bewusst nicht Teil dieser Funktion. Dafür
ist ein separater, auditierter Prozess erforderlich. Der ursprüngliche
Eingangsnachweis darf dabei nicht verändert werden.

## Sicherheits- und Abnahmetest

- `TRUSTED_CLIENT_IP_SOURCE` passend zum echten Ingress konfigurieren und die
  Provider-Header wie in `DEPLOYMENT.md` beschrieben prüfen.
- Cross-Site-POST, ungültiges JSON und ungültige Felder müssen vor dem
  Datenbankschreibvorgang scheitern.
- Gleiche Submission-ID mit gleichen Daten muss dieselbe Eingangsnummer und
  denselben Zeitpunkt liefern.
- Gleiche Submission-ID mit veränderten Daten muss scheitern.
- `UPDATE` und `DELETE` auf `withdrawal_requests` müssen auch über die Service
  Role vom Trigger abgelehnt werden.
- Erfolgreiche Mail in HTML und Plain Text prüfen. Beide Fassungen müssen Name,
  Vertragsidentifikation, Bestätigungsadresse, Erklärungstext, Eingangsnummer
  sowie lokale Zeit und UTC-Zeit enthalten.
- Providerfehler testen: Der Nachweis bleibt gespeichert, die Oberfläche zeigt
  den Eingang und bietet einen idempotenten erneuten E-Mail-Versand an.
- Der Vercel-Cron `/api/cron/email-retries` versucht fehlgeschlagene
  Widerrufsbestätigungen alle fünf Minuten erneut. `CRON_SECRET` muss im
  Produktionsprojekt gesetzt sein; der gewählte Vercel-Tarif muss dieses
  Intervall unterstützen. Zusätzlich bleibt ein protokollierter manueller
  Admin-Retry verfügbar. Derselbe geschützte Lauf wiederholt festgeschriebene
  Vertragsbestätigungen, bereinigt verwaiste vorläufige Stripe-Kunden und löscht
  danach über die service-only Datenbankfunktion unbezahlte, seit mehr als 30
  Tagen abgelaufene Checkout-Intents.
- Die hervorgehobene Footer-Schaltfläche muss ohne Anmeldung und auf mobilen
  Viewports erreichbar sein.

## Betrieb

Widerrufseingänge, Cron-Fehler und fehlgeschlagene E-Mail-Zustellungen sind
zeitnah zu überwachen. Da Nachweise absichtlich unveränderbar sind, muss ein späteres
Lösch- oder Archivierungskonzept gesetzlichen Aufbewahrungs- und
Rechenschaftspflichten entsprechen und gesondert freigegeben werden.
