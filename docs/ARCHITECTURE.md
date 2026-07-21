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

1. Die Kundin erstellt im Checkout ein Supabase-Auth-Konto; Profildaten werden getrennt vom Passwort gespeichert.
2. Nach erforderlicher E-Mail-Bestätigung bleibt die Supabase-Sitzung in sicheren Cookies erhalten.
3. Der Server liest die einzige `STRIPE_PRICE_ID`, prüft deren Produktzuordnung und erstellt eine Checkout Session mit `mode: payment`, `ui_mode: elements`, dynamischen Zahlungsmethoden und Post-Purchase-Rechnung. Pro Benutzerkonto existiert genau eine dauerhaft zugeordnete Stripe-Customer-ID.
4. Stripe.js rendert Payment/Express Elements. Karten- und Zahlungsdaten berühren den eigenen Server nicht.
5. Die Rückkehrseite zeigt nur einen Bestätigungsstatus. Sie erteilt niemals Zugang.
6. Ein signaturgeprüfter Webhook validiert `payment_status=paid`, Price-ID, Betrag, Währung, Customer-ID, Benutzerreferenz und den unveränderlichen Fingerprint der Abrechnungsdaten. Die transaktionale Datenbankoperation bestimmt genau eine bezahlte Bestellung als Zugangsquelle und aktiviert beziehungsweise bindet genau ein Enrollment.
7. Doppelte Webhooks, E-Mails und Zertifikatsanforderungen werden durch Unique Constraints und Event Keys abgefangen.

Checkout-Erstellung und Änderungen am Stripe Customer sind pro Benutzerkonto über eine kurzlebige Datenbank-Lease serialisiert. Die Lease wird vor jeder entfernten Mutation erneuert; das abschließende Profilupdate prüft ihren Token atomar in PostgreSQL. Fehlt die lokale Customer-Zuordnung, wird vor einer Neuanlage das vollständige Stripe-Customer-Inventar paginiert nach der unveränderlichen Nutzer-ID durchsucht. Eine remote vorhandene, aber lokal noch nicht verknüpfte Checkout Session wird ebenfalls vor Customer-Änderungen wiedergefunden und per Compare-and-swap an die Order gebunden.

Eine neue Session darf eine abgelaufene oder fehlgeschlagene Session erst nach belegter Sperrfreigabe ersetzen. Bezahlte, verspätete und in anderer Reihenfolge eintreffende Webhooks werden unter derselben Benutzer-/Kurssperre abgeglichen; Refunds oder Disputes einer Bestellung dürfen einen weiterhin bezahlten alternativen Zugangsbeleg nicht aufheben.

## Lernlogik

`lesson_progress.watched_seconds` speichert monoton den höchsten erreichten Abspielpunkt; Vorspulen ist damit ausdrücklich erlaubt. `watched_ranges` bleibt aus Kompatibilitätsgründen als abgeleiteter Bereich von Sekunde 0 bis zu diesem Punkt erhalten. Der Quizstart wird serverseitig erst ab dem konfigurierten Schwellwert (Standard 90 %) erlaubt. Video-Sitzungen, Fortschritt und Quizversuche tragen die Kursversion; Nachweise einer früheren Version werden nicht still für eine neue Fassung weiterverwendet.

Beim Quizstart erhält der Browser Fragen und zufällig sortierte Optionen, aber weder `is_correct` noch einen Lösungsschlüssel. Die Abgabe akzeptiert exakt eine bekannte Option je Frage, bewertet mit einem privilegierten Serverclient und speichert einen unveränderlichen Versuchssnapshot. Vier oder fünf richtige Antworten schließen die Lektion ab.

## Zertifikate

Beim siebten bestandenen Quiz prüft eine atomare Datenbankfunktion alle sieben Lektionen derselben aktuellen Kursversion und speichert einen unveränderlichen `course_completion_snapshot`. Dieser Abschlussbeleg bleibt maßgeblich, auch wenn danach eine neue Kursversion veröffentlicht wird. Normale Zertifikate müssen auf genau diesen Snapshot und dieselbe Kursversion verweisen; ein Unique-Index verhindert eine doppelte gültige Ausstellung für Nutzerin, Kurs und Version. Legacy-Zertifikate laufen getrennt über eine auditierte manuelle Evidenzprüfung und besitzen absichtlich keinen automatisch erzeugten Snapshot.

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
