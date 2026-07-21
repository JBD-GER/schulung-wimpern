# Schulung Wimpernverlängerung

Produktionsnaher Neuaufbau von `schulung-wimpernverlaengerung.de` als deutsche Online-Schulungsplattform für genau ein Produkt: **Online-Schulung Wimpernverlängerung & Wimpernstylistin – professionelle 1:1-Technik**.

Die Anwendung basiert auf Next.js 16 (App Router, React 19, TypeScript strict), Supabase/PostgreSQL, Stripe Checkout Sessions im aktuellen `ui_mode: elements`, Cloudflare Stream, Resend und privater PDF-Zertifikatserstellung.

## Enthalten

- öffentliche SEO-/Verkaufsseite, FAQ, Kontakt und vorbereitete Rechtstextseiten
- Kontoerstellung im dreistufigen Checkout und sicherer Login
- Stripe Payment Element ohne Weiterleitung auf eine gehostete Checkout-Seite
- serverseitig aus Stripe geladener Produktname, Preis, Währung sowie verbindliche Steuer- und Gesamtsumme
- idempotente Stripe-Webhooks als einzige automatische Freischaltungsquelle
- geschütztes Dashboard, sieben sequenziell freigeschaltete Lektionen und privater Videoplayer
- versionsgebundener Videofortschritt anhand des höchsten erreichten Abspielpunkts und Quizfreigabe ab 90 %
- fünf serverseitig bewertete Fragen je Lektion, 4/5-Bestehensgrenze und unbegrenzte Wiederholung
- private, idempotente PDF-Zertifikate mit nicht erratbarer Nummer, Hash und öffentlicher datensparsamer Prüfung
- transaktionale E-Mails mit HTML, Plain-Text, Event-Idempotenz und Zertifikatsanhang
- Profil-, Rechnungs-, Datenschutz- und rollenbasierter Adminbereich
- Supabase-Migrationen, RLS, Kurs-/Quiz-Seed und Importwerkzeug für Altteilnehmerinnen
- Sicherheitsheader, `noindex` für geschützte Seiten, Sitemap, robots.txt und Weiterleitungen
- Vitest-, Playwright- und Barrierefreiheitsprüfungen

## Voraussetzungen

- Node.js 22 oder neuer (entwickelt mit Node.js 24)
- npm 11 oder neuer
- Supabase-Projekt in einer passenden EU-Region
- Stripe-Konto mit genau einem aktiven Einmalpreis für das Kursprodukt
- Cloudflare-Stream-Konto mit signierten Videos
- verifizierte Absenderdomain bei Resend oder kompatiblem Anbieter
- Supabase CLI und Stripe CLI für lokale Integrationsprüfungen

## Lokale Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Öffne anschließend `http://localhost:3000`. Ohne externe Zugangsdaten rendert die Anwendung sichere Nicht-verfügbar-Zustände; echte Anmeldung, Bezahlung, Videos, E-Mails und Zertifikatsspeicherung benötigen die konfigurierten Dienste.

## Datenbank

1. Initialisiere nach einem frischen Clone einmal die lokale Supabase-CLI-Konfiguration mit `supabase init`. Der Befehl darf die versionierten Dateien in `supabase/migrations`, `supabase/templates` und `supabase/seed.sql` nicht überschreiben.
2. Verknüpfe die Supabase CLI mit `supabase link --project-ref <PROJECT_REF>` ausschließlich mit dem vorgesehenen Stagingprojekt.
3. Prüfe die Migrationen in `supabase/migrations`.
4. Wende sie auf eine leere Staging-Datenbank an.
5. Lade die Kursdaten aus `supabase/seed.sql`.
6. Markiere Quizfragen erst nach Abgleich mit den Originalvideos als `published` beziehungsweise `approved`.

```bash
supabase init                  # einmalig nach frischem Clone
supabase start                 # lokale Entwicklungsdienste
supabase db reset              # lokale Entwicklungsdatenbank + Seed
supabase db push               # verknüpftes Staging-/Produktionsprojekt
```

Der Seed veröffentlicht keine ungeprüften Lösungsschlüssel automatisch. Der Kurs darf erst live gehen, wenn alle 35 Fragen redaktionell freigegeben wurden.

## Qualitätsprüfung

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

Für vollständige Payment-/Webhook- und E-Mail-Tests sind Stripe-Testmodus, Supabase und ein Testabsender erforderlich. Siehe [Deployment](docs/DEPLOYMENT.md) und [Stripe-Konfiguration](docs/STRIPE.md).

## Wichtige Betriebsregeln

- Niemals über einen Return-URL-Parameter freischalten. Nur ein signaturgeprüfter, als bezahlt validierter Stripe-Webhook aktiviert ein Enrollment.
- Niemals `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, Cloudflare-Schlüssel oder E-Mail-API-Keys mit `NEXT_PUBLIC_` veröffentlichen.
- Keine Stream-UID oder richtigen Quizantworten an unberechtigte Browser ausgeben.
- Keine echten Anbieter-, Qualifikations-, Bewertungs- oder Zugriffsversprechen veröffentlichen, bevor sie belegt und freigegeben sind.
- Rechtstexte und die Widerrufserklärung sind technische Entwürfe, keine Rechtsberatung. Vor Livegang fachlich prüfen lassen.

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Stripe](docs/STRIPE.md)
- [Cloudflare Stream](docs/CLOUDFLARE_STREAM.md)
- [E-Mail](docs/EMAIL.md)
- [Test- und Abnahmeplan](docs/TESTING.md)
- [SEO-Weiterleitungen](docs/REDIRECTS.md)
- [Sicherheitscheckliste](docs/SECURITY_CHECKLIST.md)
- [Datenschutzcheckliste](docs/PRIVACY_CHECKLIST.md)
- [Content- und Go-live-Freigabe](docs/CONTENT_RELEASE_CHECKLIST.md)
- [Migration bestehender Teilnehmerinnen](docs/MIGRATION.md)

## Externe Freigaben vor Produktion

Der Quellcode kann externe Tatsachen nicht ersetzen. Vor einem Go-live werden mindestens benötigt: vollständige Anbieterangaben, rechtlich geprüfte Rechtstexte und Widerrufsformulierung einschließlich der unbefristeten Zugangsregelung, Stripe-Produkt/-Preis und Steuerkonfiguration, sieben Originalvideos plus deutsche Untertitel, freigegebene Kursleiterinnen-Texte/Bilder, freigegebenes Logo/Signatur sowie der Videoabgleich aller Quizfragen.
