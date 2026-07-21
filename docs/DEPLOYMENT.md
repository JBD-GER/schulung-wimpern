# Deployment

## 1. Staging zuerst

Richte eine vollständig getrennte Staging-Umgebung ein: Supabase-Stagingprojekt, Stripe-Testmodus, Cloudflare-Testvideos beziehungsweise separate UIDs, E-Mail-Testdomain und eigene Deployment-URL. Führe niemals Migrationen erstmals gegen Produktion aus.

## 2. Umgebungsvariablen

Übertrage alle benötigten Werte aus `.env.example` in den Secret Store des Hosters. Variablen mit Service Role, Secret Key, Signing Key oder API Token sind ausschließlich serverseitig. Prüfe nach dem Deployment, dass sie weder im JavaScript-Bundle noch in Build-Logs erscheinen.

Für den Payment-first-Checkout ist `CHECKOUT_INTENT_SECRET` mit mindestens 32
zufälligen Zeichen Pflicht. `CHECKOUT_INTENT_TTL_SECONDS` steuert nur die Zeit
für Dateneingabe und E-Mail-Bestätigung; beim Öffnen der Stripe Session
verlängert die Anwendung Intent und HttpOnly-Cookie automatisch auf 48 Stunden.
Der produktive Checkout ist deshalb auf unmittelbar bestätigte Karten-/Wallet-
Zahlungen begrenzt. Eine spätere Erweiterung um verzögerte Zahlarten erfordert
einen neu geprüften, länger gültigen Browser-Handoff.

### Rechtstext- und Verkaufsfreigabe

1. Anbieterangaben vollständig ohne Beispielwerte pflegen und die fest hinterlegte unbefristete Zugangsregelung rechtlich prüfen.
2. Impressum, Datenschutz, AGB und Widerruf fachlich prüfen und die passende `CHECKOUT_CONSENT_VERSION` festlegen.
3. Nach jeder inhaltlichen Änderung `npm run legal:hash` ausführen und die Ausgabe unverändert als `CHECKOUT_LEGAL_TEXT_HASH` setzen.
4. Erst nach dokumentierter Freigabe `LEGAL_TEXTS_APPROVED=true` setzen. `CONTENT_RELEASE_APPROVED=true` folgt erst nach Video-, Quiz-, Material-, Zertifikats- und Bildprüfung.

Der Release-Vertrag blockiert den Stripe-Verkauf fail-closed, wenn ein
Anbieter-Pflichtwert, die kanonische HTTPS-URL, eine der beiden Consent-
Versionen oder der exakt aktuelle SHA-256-Hash fehlt. Zusätzlich bleiben Käufe
gesperrt, bis `CHECKOUT_INTENT_SECRET` und `CRON_SECRET` jeweils mindestens 32
geprüfte Zufallszeichen enthalten und `TRUSTED_CLIENT_IP_SOURCE=vercel` gesetzt
ist. Die Checkout-Consent-Version kommt serverseitig in den Checkout; ein
Versionswechsel erfordert deshalb keine fest verdrahtete Clientänderung, aber
immer eine neue rechtliche Freigabe und einen neuen Hash.

`CHECKOUT_LEGAL_TEXT_HASH` ist kein Passwort und kein Stripe-Schlüssel. Der Wert
ist ein reproduzierbarer Fingerabdruck der versionierten Rechtstexte, der
Zugangsregelung, der verbindlichen Checkout-Erklärungen, des elektronischen
Widerrufsformulars und der konkreten Anbieterwerte. Der Build vergleicht ihn
mit dem aktuellen Stand und blockiert den Verkauf bei einer Abweichung. Er
belegt, welche geprüfte Textfassung beim Checkout galt.
Der Beispielwert `sha256_REPLACE_WITH_APPROVED_TEXT_HASH` darf deshalb niemals
in Staging oder Produktion stehen bleiben und ein alter Hash darf nach einer
Textänderung nicht weiterverwendet werden.

## 3. Supabase

- Projektregion und Vertragsunterlagen datenschutzrechtlich prüfen.
- Migrationen anwenden und RLS aktiv lassen.
- Auth-Site-URL auf die kanonische HTTPS-Domain setzen.
- Unter **Authentication → Sign In / Providers** öffentliche neue Signups
  deaktivieren. Neue Teilnehmer werden ausschließlich serverseitig nach
  verifizierter Paid-Evidenz angelegt; der historische App-Endpunkt
  `/api/auth/signup` antwortet zusätzlich fail-closed mit HTTP 410.
- erlaubte Redirect-URLs für `/api/auth/callback`, `/checkout` und `/passwort-zuruecksetzen` eng begrenzen.
- SMTP/Transaktionsversand für Auth-Mails konfigurieren.
- private Storage-Buckets anlegen; keine Zertifikate öffentlich schalten.
- Point-in-Time-Recovery beziehungsweise Backups aktivieren und Wiederherstellung testen.
- Den in `vercel.json` definierten Fünf-Minuten-Cron aktivieren und im
  Funktionsprotokoll prüfen. Er übernimmt bezahlte, nach einem Prozessfehler
  noch nicht freigeschaltete Intents, versendet ausstehende Widerrufs- und
  Vertragsbestätigungen erneut, löscht verwaiste vorläufige Stripe-Kunden und
  anschließend unbezahlte, seit mehr als 30 Tagen abgelaufene Checkout-Intents.
  Der Vercel-Tarif muss dieses Intervall unterstützen.
  Ein HTTP-503-Ergebnis mit `pendingPaidIntents`, `pendingStripeCustomers` oder
  `pending` größer null ist ein Betriebsalarm; der Lauf hat sichere Teilaufgaben
  dennoch abgeschlossen und versucht die offenen Vorgänge beim nächsten Termin
  erneut.

### Checkout-Retention

Unbezahlte Checkout-Intents enthalten E-Mail-, Namens- und gegebenenfalls
Rechnungsdaten. Der oben genannte Vercel-Cron ruft die service-only-Funktion
`public.purge_expired_unpaid_checkout_intents()` erst auf, nachdem er
verbliebene, ausschließlich für unbezahlte anonyme Checkouts angelegte
Stripe-Customer über die Stripe API gelöscht und lokal entkoppelt hat. Die
Funktion löscht ausschließlich Intents ohne Paid-Evidenz und ohne Order, deren
sichere Laufzeit seit mehr als 30 Tagen beendet ist. Ein noch zu bereinigender
Stripe-Customer blockiert die lokale Löschung, damit seine Zuordnung nicht
verloren geht. Bezahlte oder provisionierte Evidenz wird nie durch diesen Job
entfernt. Der operative Cron-Nachweis und die identische Frist in der
Datenschutzerklärung sind Go-live-Pflicht. Es darf nicht zusätzlich ein
unkoordiniert laufender Supabase-Cron eingerichtet werden. Unabhängige
gesetzliche oder sicherheitsbezogene Stripe-Aufbewahrung ist im freigegebenen
Löschkonzept gesondert zu dokumentieren.

### Serverseitige Auth-Maillinks

Die Standard-Links von Supabase können Sitzungsdaten nach der Bestätigung als URL-Fragment zurückgeben; ein Server-Callback kann Fragmente nicht lesen. Hinterlege deshalb im Supabase-Dashboard unter **Authentication → Email Templates** die vier versionierten Vorlagen aus `supabase/templates/`:

- `confirmation.html` für „Confirm signup“
- `recovery.html` für „Reset password“
- `invite.html` für „Invite user“
- `email-change.html` für „Change email address“

Die Vorlagen bauen den Link ausdrücklich aus `{{ .SiteURL }}`, `{{ .TokenHash }}` und dem passenden Typ auf. Der Callback verifiziert den Hash serverseitig über `verifyOtp`; Recovery und Invite erzeugen danach einen einmaligen, zehn Minuten gültigen Passwort-setzen-Nachweis. Verwende für Einladungen keinen PKCE-Code-Flow. Nimm die kanonische Domain und die Staging-Domain in die Supabase-Redirect-Allowlist auf und teste jeden der vier Mailtypen in Staging. Link-Tracking beim Auth-Mailprovider muss deaktiviert sein.

## 4. Externe Dienste

Folge den getrennten Anleitungen für [Stripe](STRIPE.md), [Cloudflare Stream](CLOUDFLARE_STREAM.md), [E-Mail](EMAIL.md), die [Datenschutz- und Cookie-Abnahme](PRIVACY.md) und die [elektronische Widerrufsfunktion](WIDERRUF.md).

## 5. Domain und Netzwerk

- `www.schulung-wimpernverlaengerung.de` als kanonische Domain festlegen.
- non-www und HTTP mit einem direkten 301 auf die kanonische HTTPS-URL leiten.
- keine Redirect-Ketten erzeugen.
- DNSSEC, HSTS und TLS-Konfiguration prüfen.
- CSP zunächst in Staging gegen alle echten Payment- und Videoabläufe testen.

### Vertrauenswürdige Client-IP für Rate-Limits

Die Anwendung ignoriert frei einsendbare `X-Forwarded-For`- und `X-Real-IP`-Werte. Setze `TRUSTED_CLIENT_IP_SOURCE` erst nach Prüfung des tatsächlichen Ingress:

- `vercel`: nur bei direktem Vercel-Ingress; ausgewertet wird das von Vercel gesetzte `X-Vercel-Forwarded-For`.
- `cloudflare`: ausgewertet wird `CF-Connecting-IP`. Der Origin muss ausschließlich über Cloudflare erreichbar sein, etwa per Cloudflare Tunnel, Authenticated Origin Pulls oder Firewall-Allowlist. Direkten Origin-Zugriff und ungeschützte Provider-Preview-Domains sperren.
- leer: fail-closed. Alle nicht angemeldeten Anfragen teilen sich einen Rate-Limit-Bucket; das verhindert Header-Spoofing, ist aber nur eine vorübergehende Staging-Einstellung.

Prüfe in Staging mit einem selbst gesetzten `X-Forwarded-For`, dass der Bucket nicht wechselt, und mit zwei echten Client-Netzen, dass der konfigurierte Provider-Header unterschiedliche Buckets ergibt. Die Ingress-Einstellung und der Testnachweis sind Go-live-Pflicht.

## 6. Build und Migration

Die CLI wendet alle versionierten Dateien bis `202607210011` in Namensreihenfolge an. Prüfe vor Produktion beide Pfade separat: eine vollständig leere Datenbank über die gesamte Kette sowie eine Kopie des bisherigen Schemas. Auf dem Upgrade-Pfad sind insbesondere das Payment-Hardening (`004`), der playhead-basierte Fortschritt (`005`), die Zertifikats-Unveränderlichkeit und Namensbestätigung (`006`/`007`), der dauerhafte Abschluss-Replay und die atomare Quizabgabe (`008`), die rollenbasierte Admin-Härtung (`009`), der zahlungsabhängige Checkout (`010`) sowie der unveränderliche elektronische Widerrufsnachweis (`011`) zu prüfen. Erst nach erfolgreicher Datenprüfung und einem Restore-Test darf derselbe Stand Produktion erreichen.

### Pflicht-Preflight vor Migration 004 auf einem bereits genutzten System

Migration 004 ersetzt den Stripe-Nachweisvertrag. Eine ältere Checkout Session oder ein älterer Payment Intent besitzt den neuen `billing_fingerprint` nicht automatisch; SQL darf entfernte Stripe-Metadaten nicht erraten. Die Migration bricht deshalb mit `STRIPE_HARDENING_PREFLIGHT_REQUIRED` ab, sobald eine native, nicht über den Legacy-Importer angelegte Stripe-Bestellung keinen eindeutig zugeordneten Kurs und passenden 64-stelligen Fingerprint besitzt. Diese SQL-Schranke prüft nur den lokalen Bestand; die Vollständigkeit des entfernten Stripe-Inventars muss der folgende API-Preflight gesondert belegen.

1. Checkout in den Wartungsmodus setzen, aber den bisherigen signaturgeprüften Webhook zunächst weiterverarbeiten lassen.
2. Alle nativen lokalen Stripe-Bestellungen exportieren, ausdrücklich auch Zeilen ohne gespeicherte Session- oder Payment-Intent-ID. Zusätzlich über die Stripe API **alle** Checkout Sessions und Payment Intents des betroffenen Accounts für den gesamten Einsatzzeitraum beziehungsweise mindestens für das Produkt/den Price paginiert auflisten. Nicht nur bekannte lokale IDs abrufen: Eine remote erfolgreich erstellte, aber vor dem lokalen Verknüpfen abgestürzte Session ist sonst unsichtbar. Customer, Nutzerreferenz, Metadaten, Price, Betrag, Währung und Status in beide Richtungen abgleichen; unbekannte oder mehrdeutige Objekte stoppen den Rollout.
3. Jede noch offene Checkout Session aus diesem vollständigen Stripe-Inventar remote ablaufen lassen, auch wenn lokal keine Session-ID gespeichert ist. `complete`/unbezahlte oder asynchron verarbeitete Sessions bis zum endgültigen Ereignis unter dem bisherigen Handler beobachten; bezahlte Ereignisse vollständig verbuchen. Es darf keine unbekannte zweite offene Session desselben Kontos verbleiben.
4. Für aufzubewahrende terminale Objekte Kurs und Abrechnungssnapshot nur aus belegter lokaler Zuordnung übernehmen. In einem protokollierten Vier-Augen-Lauf einen deterministischen Migrations-Fingerprint erzeugen und exakt denselben Wert sowie `user_id`, `course_id`, `order_id` und `price_id` in lokalem Snapshot, Checkout-Session- und Payment-Intent-Metadaten hinterlegen. Keine fehlenden Zahlungs-, Adress- oder Kursdaten erfinden.
5. Das vollständige Account-Inventar erneut paginiert aus Stripe lesen, lokale und entfernte Mengen/IDs abgleichen, Null-ID-Fälle ausdrücklich bestätigen und den Bericht revisionssicher ablegen. Erst dann Migration 004 auf der Staging-Kopie erneut ausführen, reale Success-/Refund-/Dispute-Replays testen und anschließend denselben kontrollierten Ablauf für Produktion freigeben.

Ohne vorhandene Produktionsbestellungen ist kein Retrofit nötig; die leere vollständige Migrationskette bleibt der maßgebliche Fresh-Install-Pfad.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
supabase db push
```

Anschließend Smoke Tests und Playwright gegen die Staging-URL ausführen. Einen Datenbank-Rollbackplan und ein vor der Migration erstelltes Backup bereithalten.

## 7. Abnahme

- erfolgreicher Privat- und Unternehmenskauf im Stripe-Testmodus
- fehlgeschlagene, abgebrochene und verzögerte Zahlung
- doppeltes Webhook-Ereignis ohne doppelte Nebenwirkung
- zwei parallele Checkout-Anfragen ergeben genau einen Stripe Customer und höchstens eine nutzbare offene Session
- abgelaufene Session mit verspäteter echter Zahlung; der bezahlte Beleg gewinnt ohne doppeltes Enrollment
- zwei authentisch bezahlte Bestellungen; Refund/Dispute in beiden Reihenfolgen erhält Zugang genau dann, wenn noch ein bezahlter, nicht widerrufener Beleg existiert
- nicht angemeldeter und nicht eingeschriebener Videozugriff mit 401/403
- 3/5 und 4/5 Quizablauf
- einmaliger Kursabschluss, ausdrückliche Namensbestätigung, genau eine PDF-Ausstellung und PDF-E-Mail
- vollständige Kurswiederholung nach Abschluss ohne neue Fortschritts- oder Quizschreibvorgänge
- zweistufiger öffentlicher Widerruf, unveränderlicher Nachweis und sofortige
  E-Mail-Eingangsbestätigung; Cross-Site-Aufrufe und Mutationsversuche werden
  abgelehnt
- Rückerstattung und Dispute-Sperre
- Kursabschluss bleibt nach Veröffentlichung einer neuen Kursversion über seinen unveränderlichen Snapshot zertifizierbar; unfertiger alter Fortschritt wird nicht übernommen
- 320-Pixel-Viewport, Tablet und Desktop
- Tastaturbedienung, Untertitel und Screenreader-Labels
- Rich Results, Sitemap, Canonicals, noindex und Redirects
- Datenschutzerklärung mit den tatsächlich eingesetzten Dienstanbietern

## 8. Go-live und Monitoring

Aktiviere Produktion erst nach Abschluss der Content-, Sicherheits- und Datenschutzchecklisten. Überwache danach Webhook-Fehler, E-Mail-Fehler, fehlgeschlagene Zertifikate, ungewöhnliche Tokenraten und Auth-Brute-Force-Versuche. Fehlerberichte dürfen keine kompletten Webhook-Payloads, Tokens, Adressen oder Quizantworten enthalten.
