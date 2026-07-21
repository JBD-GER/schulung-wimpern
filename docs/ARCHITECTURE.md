# Architektur

## Vertrauensgrenzen

Der Browser ist grundsätzlich nicht vertrauenswürdig. Er erhält nur veröffentlichte Fragen ohne Lösungsschlüssel, kurzlebige Video-Playback-Tokens und Daten der eigenen angemeldeten Person. Folgende Entscheidungen fallen ausschließlich serverseitig:

- aktuelle Produkt- und Preisdaten aus Stripe
- Authentifizierung, Rollen- und Enrollment-Prüfung
- Freischaltung nach signaturgeprüftem Zahlungsereignis
- Zusammenführen angesehener Videozeitbereiche
- Quizbewertung und nächste freigeschaltete Lektion
- Kursabschluss, Zertifikatsausstellung und E-Mail-Ereignisse
- Adminberechtigungen und Audit-Protokollierung

## Ablauf vom Kauf bis zum Zugang

1. Der Browser legt nur einen service-role-geschützten `checkout_intent` an. Ein zufälliges HttpOnly-Cookie bindet ihn an denselben Browser; neue Adressen werden per einmaligem E-Mail-Link bestätigt. Dabei entstehen weder Auth-User noch Order oder Enrollment.
2. Der Server liest die einzige `STRIPE_PRICE_ID`, bindet den Rechnungs- und Consent-Snapshot unveränderlich an den Intent und erstellt eine Checkout Session mit `mode: payment`, `ui_mode: elements` und Post-Purchase-Rechnung. Je E-Mail/Kurs kann höchstens ein Intent gleichzeitig eine zahlbare Session besitzen.
3. Stripe.js rendert ausschließlich das Payment Element. Nur der eindeutig beschriftete eigene Button „Zahlungspflichtig bestellen“ löst `confirm` aus; Zahlungsdaten berühren den eigenen Server nicht.
4. Die Rückkehrseite fragt nur den cookie-gebundenen Zustand ab. Sie darf selbst keine Zahlung behaupten und wartet auf den Webhook.
5. Ein signaturgeprüfter Webhook lädt Session, Payment Intent und Customer erneut bei Stripe. Er validiert `payment_status=paid`, Status, Price, Menge, Betrag, Währung, Customer, bestätigte E-Mail, finale Rechnungsanschrift und den unveränderlichen Fingerprint.
6. Erst nachdem diese Paid-Evidenz atomar gespeichert ist, wird ein vorhandener bestätigter Auth-User gebunden oder ein neuer Auth-User erstellt. Dieselbe Transaktion erzeugt die bezahlte Order, den Consent-Nachweis und genau ein aktives Enrollment.
7. Ein zweiphasiger Browser-Handshake erstellt anschließend sichere Supabase-Cookies und quittiert sie in einem zweiten cookie-gebundenen Aufruf. Erst dann wird der Bootstrap einmalig verbraucht und zum Dashboard weitergeleitet.
8. Doppelte Webhooks, parallele Sessions, Rechnungsereignisse und E-Mails werden durch Advisory Locks, Leases, Unique Constraints und Event Keys abgefangen.

Der historische Order-first-POST ist mit HTTP 410 stillgelegt. Nur GET-Status und Webhook-Verarbeitung bleiben erhalten, damit bereits vor dem Wechsel geöffnete Stripe Sessions sicher auslaufen können. Refunds oder Disputes einer Bestellung dürfen einen weiterhin bezahlten alternativen Zugangsbeleg nicht aufheben.

## Lernlogik

`lesson_progress.watched_seconds` speichert monoton den höchsten erreichten Abspielpunkt; Vorspulen ist damit ausdrücklich erlaubt. `watched_ranges` bleibt aus Kompatibilitätsgründen als abgeleiteter Bereich von Sekunde 0 bis zu diesem Punkt erhalten. Der Quizstart wird serverseitig erst ab dem konfigurierten Schwellwert (Standard 90 %) erlaubt. Video-Sitzungen, Fortschritt und Quizversuche tragen die Kursversion; Nachweise einer früheren Version werden nicht still für eine neue Fassung weiterverwendet. Nach einem belegten Kursabschluss bleibt der vollständige Kurs als schreibgeschützte Wiederholung zugänglich; dabei entstehen weder neue Fortschrittsdaten noch neue Quizversuche.

Beim Quizstart erhält der Browser Fragen und zufällig sortierte Optionen, aber weder `is_correct` noch einen Lösungsschlüssel. Die Abgabe akzeptiert exakt eine bekannte Option je Frage, bewertet mit einem privilegierten Serverclient und speichert einen unveränderlichen Versuchssnapshot. Vier oder fünf richtige Antworten schließen die Lektion ab.

## Zertifikate

Beim siebten bestandenen Quiz prüft eine atomare Datenbankfunktion alle sieben Lektionen derselben aktuellen Kursversion und speichert einen unveränderlichen `course_completion_snapshot`. Dieser Abschlussbeleg bleibt maßgeblich, auch wenn danach eine neue Kursversion veröffentlicht wird. Er erzeugt noch kein Zertifikat: Die Teilnehmerin muss den gedruckten Vor- und Nachnamen zuerst ausdrücklich bestätigen. Die unveränderliche Bestätigung ist an Snapshot, Kursversion und Profilidentität gebunden; erst danach darf genau eine Zertifikatszeile angelegt werden. Technisch fehlgeschlagene Erstellungsversuche verwenden dieselbe Zeile idempotent weiter. Finalisierte Zertifikatsinhalte bleiben unveränderlich. Legacy-Zertifikate laufen getrennt über eine auditierte manuelle Evidenzprüfung und besitzen absichtlich keinen automatisch erzeugten Snapshot.

PDF, SHA-256-Hash, zufällige Zertifikatsnummer und privater Storage-Key werden gespeichert. Öffentliche Prüfungen geben standardmäßig nur Status, Kurs, Nummer, Datum und optional freigegebene Initialen aus.

## Caching

- personalisierte, Auth-, Checkout-, Video- und API-Antworten: `no-store`
- Playback-Tokens: niemals zwischen Nutzerinnen cachen
- Stripe-Katalog: kurzlebiges serverseitiges Revalidieren ist möglich; Fehler dürfen keinen alten Fantasiepreis erzeugen
- öffentliche Marketinginhalte: statisch oder serverseitig renderbar

## Dienstverantwortung

| Bereich            | System                    | Gespeichert                                                                |
| ------------------ | ------------------------- | -------------------------------------------------------------------------- |
| Identität/Passwort | Supabase Auth             | Passwort-Hash beim Provider, keine Klartextpasswörter                      |
| Fachdaten          | Supabase PostgreSQL       | Profil, Bestellung, Fortschritt, Versuche, Zertifikatsmetadaten            |
| Zahlung/Rechnung   | Stripe                    | Zahlungsdaten, genau ein Customer je Konto, Payment, Invoice               |
| Video              | Cloudflare Stream         | private Videos, Untertitel, signierte Playback-Ausgabe                     |
| E-Mail             | Resend                    | Versandmetadaten; eigener Versandstatus zusätzlich minimiert protokolliert |
| Zertifikatsdatei   | privater Supabase Storage | PDF; Zugriff nur authentifiziert oder kurzlebig signiert                   |
