# Migration bestehender Teilnehmerinnen

## Unterstützte CSV-Felder

Die Importvorlage beziehungsweise das Skript akzeptiert mindestens:

```text
source_id,first_name,last_name,email,purchase_date,payment_status,course_access,completed_lessons,certificate_status,payment_source
```

`source_id` ist die unveränderliche ID des ursprünglichen Kaufs beziehungsweise Datensatzes. Sie muss innerhalb der jeweiligen `payment_source` dauerhaft eindeutig sein; dadurch bleibt der Import auch unter einer neuen Batch-ID idempotent. `payment_source` ist einer der Werte `stripe`, `paypal`, `manual` oder `legacy`. E-Mail-Adressen werden normalisiert und vor dem Schreiben dedupliziert. Der Import darf keine Klartextpasswörter enthalten.

Eine direkt nutzbare Vorlage liegt unter `supabase/participants-import.template.csv`. Die optionalen Felder `amount_minor` und `currency` müssen entweder gemeinsam oder beide leer sein.

## Dry Run und Import

Der Befehl ist standardmäßig schreibgeschützt:

```bash
npm run migrate:participants -- --file ./teilnehmerinnen.csv
```

Er validiert Encoding/CSV-Struktur, Pflichtspalten, E-Mail-Adressen, streng formatierte ISO-Datumswerte, Statuskombinationen, Beträge, Abschlusslogik und Duplikate. Sind Supabase-Variablen gesetzt, prüft er zusätzlich Kontozuordnung, globale Quellen-IDs und Konflikte mit vorhandenen Profilnamen, Teilnahmen, Fortschritten und Zertifikaten. Ohne Zugangsdaten bezeichnet die Ausgabe den Lauf ausdrücklich als **lokalen** Dry Run.

Fehlende Konten werden ausschließlich in einem getrennten Vorbereitungsschritt eingeladen:

```bash
npm run migrate:participants -- \
  --file ./teilnehmerinnen.csv \
  --send-invites
```

Dieser explizite Schritt kann wiederholt werden und importiert keine Bestellungen, Teilnahmen oder Fortschritte. Nach Kontenanlage wird der vollständige DB-Dry-Run erneut ausgeführt. `--send-invites` und `--apply` sind absichtlich nicht kombinierbar.

Erst `--apply` aktiviert den atomaren Business-Import. Zum Schutz vor versehentlichem Start müssen Batch-ID und Bestätigung explizit gesetzt und exakt gleich sein:

```bash
npm run migrate:participants -- \
  --file ./teilnehmerinnen.csv \
  --apply \
  --batch-id IMPORT-2026-01 \
  --confirm IMPORT-2026-01
```

Benötigt werden `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`, für Einladungen zusätzlich `NEXT_PUBLIC_SITE_URL` und für Stripe-Altzahlungen `STRIPE_PRICE_ID`. Fehlende Konten stoppen den Business-Import immer vollständig; ein Passwort wird nie erzeugt.

Vor dem Einladungsdurchlauf muss die Supabase-Vorlage „Invite user“ mit `supabase/templates/invite.html` konfiguriert sein. Sie übergibt `TokenHash` und `type=invite` an den Server-Callback. Dieser authentifiziert die Einladung einmalig und führt zwingend auf „Neues Passwort festlegen“; eine Einladung landet nicht unbemerkt mit unsetzbarem Passwort im Dashboard. Die genaue Dashboard-Konfiguration steht in `docs/DEPLOYMENT.md`.

Der Business-Import läuft in einer PostgreSQL-Transaktion: Der Server wiederholt den Preflight unter einer Transaktionssperre und schreibt entweder den gesamten Batch oder gar nichts. Jede erfolgreich abgeschlossene Zeile erhält globale Quellen-ID, Batch-ID und Quellzeile in der Importtabelle und im Audit Log. Eine bereits importierte Kombination aus `payment_source` und `source_id` wird unabhängig von Batch-ID und Zeilennummer übersprungen. Vorhandene Profile, Teilnahmen, Fortschritte und Zertifikate werden niemals still überschrieben oder herabgestuft; Abweichungen erzwingen eine manuelle Klärung.

Ein gemeldeter alter Zertifikatsstatus wird absichtlich nur als Prüfauftrag in der Admin-Warteschlange protokolliert: Ohne Original-PDF, Hash und nachweisbare Nummer darf das Skript kein scheinbar gültiges Zertifikat erfinden. Ebenso wird aus einer historischen Abschlusszahl weder ein angesehenes Video noch ein bestandener 4/5-Quizversuch erfunden. Gemeldete Lektionen erhalten ausschließlich den Marker `legacy_completed`; dadurch zählen sie in Navigation und Fortschrittsanzeige als abgeschlossen, während Wiedergabe- und Quiznachweise unverändert unbekannt bleiben. Sie erzeugen niemals automatisch einen `course_completion_snapshot` und lösen deshalb auch nach späteren Kursänderungen keine automatische Zertifikatsausstellung aus.

Erst nach dokumentierter Evidenzprüfung darf eine Administratorin einen Altverweis ablehnen, einem bereits vorhandenen echten Zertifikat zuordnen oder über den getrennten, auditierten Legacy-Pfad ein neues PDF ausstellen. Für eine bestätigte Legacy-Ausstellung muss sie die aus der Quelle belegte Kursversion im Format `JJJJ.N` angeben; die aktuelle Plattformversion ist kein Ersatzbeleg. Eine Ablehnung benötigt keine Versionsangabe. Unbekannte historische Rückerstattungs-, Widerrufs- oder Abschlusszeitpunkte bleiben `NULL` und werden nicht aus Import- oder Prüfdatum erfunden. Bis zum abgeschlossenen Prüfentscheid gibt es keinen Zertifikatsdownload.

## Sicherer Ablauf

1. Exportquelle, Rechtsgrundlage und Datenumfang dokumentieren.
2. CSV verschlüsselt in eine isolierte Staging-Umgebung übertragen.
3. Lokalen Dry Run und anschließend mit Staging-Zugang den vollständigen DB-Preflight ausführen.
4. Konflikte anhand exakter normalisierter E-Mail, Quellen-ID und bestehender Auth-ID manuell klären.
5. Fehlende Konten separat einladen, Kontenanlage abwarten und DB-Preflight wiederholen.
6. Daten in Batches bis maximal 500 Zeilen atomar importieren; jede Zeile mit Import-ID/Audit Log versehen.
7. Bestehende Passwörter nur bei nachweislich kompatiblem, sicherem Hashverfahren migrieren. Standard ist **keine Passwortübernahme**.
8. Für neue Auth-Konten einmalige, kurzlebige Aktivierungs-/Passwort-setzen-Links verschicken.
9. Stichprobe von Zugang, unverändertem Legacy-Marker, Zahlungshistorie, unbekannten Zeitfeldern und Zertifikats-Prüfstatus prüfen; belegte Kursversionen mit der Originalquelle abgleichen.
10. Quelldatei nach dokumentierter Frist sicher löschen.

## Abbruch- und Rollbackregeln

Der Import muss vor Änderungen einen DB-Dry-Run-Bericht erzeugen. Bei unerwarteten Duplikaten, unbekannten Zahlungsstatus, Bestandskonflikten oder fehlerhafter Zeichencodierung wird der Batch nicht begonnen. Scheitert ein SQL-Schritt, rollt PostgreSQL alle Business-Daten dieses Batches zurück. Kontoeinladungen sind ein separater, wiederholbarer Vorbereitungsschritt und werden nie als Teil eines angeblich atomaren Imports dargestellt. Ein späterer fachlicher Rollback löscht ausschließlich eindeutig über Quellen-/Batch-ID identifizierbare, rücksetzbare Importdaten und niemals bestehende Konten oder gesetzlich aufzubewahrende Bestellungen.

## Kommunikation

Aktivierungsmails erläutern transparent, warum ein Konto angelegt wurde, wie der bestehende Zugang übernommen wird und wo Datenschutz-/Supportinformationen stehen. Sie enthalten kein temporäres Klartextpasswort.
