# Test- und Abnahmeplan

Die lokale Suite prüft deterministische Verträge ohne echte Kundendaten. Eine Produktionsfreigabe setzt zusätzlich einen vollständigen Durchlauf in einer getrennten Staging-Umgebung mit Stripe-Testmodus, Supabase, Cloudflare Stream und E-Mail-Testdomain voraus.

## Automatisierte lokale Prüfungen

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

Playwright startet standardmäßig den lokalen Entwicklungsserver und prüft Desktop sowie 320 Pixel Breite. Gegen ein bereits bereitgestelltes Staging-System läuft dieselbe öffentliche Suite so:

```bash
PLAYWRIGHT_BASE_URL=https://staging.example.test npm run test:e2e
```

Die Vitest-Suite deckt unter anderem Kurs- und Seed-Integrität, Stripe-Preisquelle, Checkout-Gesamtsummen, Customer-/Session-Rennen, Webhook-Signatur und -Idempotenz, verspätete Zahlungen, Refund-Reihenfolgen, Video-Berechtigungen, versionsgebundene Fortschritte, 3/5- und 4/5-Quizabgaben, manipulierte IDs, Abschluss-Snapshots, Zertifikats-Retry, Zertifikats-Unicode/Langnamen, Migrationsimport sowie Admin- und Profiloberflächen ab. Externe APIs werden dabei gezielt simuliert; diese Tests ersetzen keinen realen Testkauf und keine Ausführung der PostgreSQL-Migrationen.

## Zuordnung zu den 14 Abnahmekriterien

| Nr. | Kriterium                | Automatisiert                                                           | Verbindliche Staging-Abnahme                                                                            |
| --- | ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | identischer Stripe-Preis | Preisquellen- und Checkout-Totals-Tests; kein Ersatzbetrag im UI        | Startseite, Checkout, Stripe Session und Rechnung in Betrag/Währung vergleichen                         |
| 2   | privater Kauf            | Auth-, Checkout-, Webhook- und Bestätigungsbausteine                    | neues Konto, E-Mail-Bestätigung, Testzahlung, Login-Erhalt, Dashboard, Aktivierungsmail und Rechnung    |
| 3   | Unternehmenskauf         | Schema, Rechnungsadresse, Rechtsform, Ansprechpartner und Steuervertrag | Testrechnung mit Firmenanschrift und optionaler gültiger USt-ID prüfen                                  |
| 4   | fehlgeschlagene Zahlung  | Webhook-Test bestätigt: kein Enrollment und keine Aktivierungsmail      | abgebrochene, abgelehnte und verzögert fehlgeschlagene Testzahlung                                      |
| 5   | doppelter Webhook        | Handler-Test bestätigt einmalige Freischaltung/Mail                     | dasselbe echte Stripe-Ereignis per CLI erneut senden und DB prüfen                                      |
| 6   | Videozugriff             | Routen-Integration für 401/403, Lock und signierten Token               | echtes Video, Origin-Schutz, Untertitel und Ablauf des Tokens prüfen                                    |
| 7   | Quiz 3/5                 | echte Route mit simuliertem Datendienst: gesperrt und wiederholbar      | Browserablauf inklusive Fokus/Screenreader-Meldung                                                      |
| 8   | Quiz 4/5                 | echte Route mit simuliertem Datendienst: nächste Lektion frei           | Browserablauf und persistierten Dashboard-Fortschritt prüfen                                            |
| 9   | Quizsicherheit           | Response-/RLS-Verträge und manipulierte Option-ID                       | HTML, RSC, Netzwerkantworten und Produktionsbundle ohne Lösungsschlüssel untersuchen                    |
| 10  | Kursabschluss            | Zertifikats-, E-Mail- und Datenbankverträge                             | sieben Lektionen, je eine Abschluss-/Zertifikatsmail, PDF-Anhang, Download und öffentliche Prüfung      |
| 11  | wiederholter Abschluss   | Claims, Unique Constraints und Idempotenztests                          | Reload sowie erneutes Ereignis; Anzahl Zertifikate/Mails bleibt eins                                    |
| 12  | responsive Nutzung       | öffentliche Playwright-Suite auf 320 Pixel und Desktop                  | authentifizierter Checkout, Dashboard, Video, Quiz, Zertifikat und Profil auf Smartphone/Tablet/Desktop |
| 13  | SEO                      | H1, Sitemap, noindex, 301 und Preisquellen automatisiert                | Canonicals, strukturierte Daten und Rich Results auf kanonischer Staging-Domain                         |
| 14  | Barrierefreiheit         | Axe-Smoke-Test, Labels, Zustands- und UI-Tests                          | vollständige Tastatur-, Fokus-, Untertitel- und Screenreader-Prüfung aller geschützten Abläufe          |

## Stripe-/Webhook-Abnahme

1. Einen echten Testkauf über das eingebettete Payment Element durchführen.
2. In Stripe prüfen: genau eine Checkout Session, bezahlte Rechnung, korrekte Anschrift, Produkt, Währung, Steuer und Gesamtbetrag.
3. Das konkrete Ereignis mit der Stripe CLI erneut senden; Enrollment und Aktivierungsmail dürfen sich nicht verdoppeln.
4. Testereignisse für asynchron fehlgeschlagene Zahlung, Ablauf, vollständige Rückerstattung und Dispute ausführen.
5. Zwei parallele Session-Anfragen, Session-Rotation mit verspäteter Zahlung sowie zwei bezahlte Bestellungen mit Refunds in beiden Reihenfolgen ausführen. Zu jedem Zeitpunkt darf es nur einen dauerhaften Stripe Customer und höchstens ein Enrollment geben; Zugang bleibt nur bei mindestens einem weiterhin gültigen Zahlungsbeleg bestehen.
6. Die lokalen Tabellen `stripe_customers`, `checkout_customer_leases`, `orders`, `enrollments`, `webhook_events`, `email_deliveries` und `audit_logs` anhand der erwarteten Zustandsübergänge prüfen, ohne Payloads oder personenbezogene Daten in Testprotokolle zu kopieren.

## Datenbank- und Versionsabnahme

1. Die vollständige Migrationskette auf einer leeren Staging-Datenbank anwenden und den Seed laden.
2. Dieselbe Kette, insbesondere Migration `202607210004`, gegen eine wiederhergestellte Kopie des vorherigen Schemas testen; Constraints, Rechte und bestehende Daten kontrollieren.
3. Einen Kurs der aktuellen Version vollständig abschließen und den gespeicherten `course_completion_snapshot` samt Zertifikatsbezug prüfen.
4. Danach eine neue Kursversion veröffentlichen: Der alte abgeschlossene Snapshot bleibt abrufbar, unfertiger Fortschritt der alten Version schaltet aber weder Video, Quiz noch Zertifikat der neuen Version frei.
5. Einen Legacy-Abschluss importieren. Er darf keinen Snapshot erzeugen; eine bestätigte manuelle Ausstellung verlangt die anhand der Quelle belegte historische Kursversion.

## Abschlussprotokoll

Für jeden Staging-Durchlauf Datum, Release-Commit, Browser/Gerät, Stripe-Ereignis-IDs, erwartetes Ergebnis, tatsächliches Ergebnis und verantwortliche Freigabe dokumentieren. Keine Live-Schlüssel, Auth-Tokens, Adressen, Quizlösungen oder komplette Webhook-Payloads in Screenshots beziehungsweise Tickets übernehmen. Ein fehlender externer Durchlauf ist ein Go-live-Blocker und darf nicht als bestanden markiert werden.
