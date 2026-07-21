# Sicherheitscheckliste

## Identität und Berechtigung

- [ ] E-Mail-Bestätigung und Recovery-Redirects nur auf erlaubte Origins
- [ ] sichere httpOnly-, Secure- und passende SameSite-Cookies in Produktion
- [ ] Re-Authentifizierung vor E-Mail-, Passwort- und Zertifikatsnamenänderung
- [ ] Adminrolle ausschließlich serverseitig, keine E-Mail-Prüfung nur im Client
- [ ] 2FA für alle Admin-Konten aktiviert
- [ ] Sitzungsübersicht und „andere Sitzungen abmelden“ getestet
- [ ] Login-, Reset-, Quiz-, Video- und Kontakt-Endpunkte rate-limited
- [ ] Account-Enumeration in Login/Reset/Signup-Antworten vermieden
- [ ] `TRUSTED_CLIENT_IP_SOURCE` entspricht dem tatsächlichen letzten Proxy; Origin ist gegen Umgehung geschützt und manipulierte Forwarding-Header wurden in Staging getestet

## Zahlung

- [ ] Stripe-Signaturprüfung nutzt Raw Body und Live-Webhook-Secret
- [ ] Price-ID und Product-ID stimmen mit genau einem aktiven Einmalpreis überein
- [ ] Betrag, Währung, Customer/User und Paid-Status werden serverseitig validiert
- [ ] doppelte Events durch Datenbankconstraint und Transaktion idempotent
- [ ] Return-URL allein erteilt niemals Zugriff
- [ ] verzögerte, fehlgeschlagene, abgelaufene und abgebrochene Zahlung getestet
- [ ] Refund-/Dispute-Regel mit Fachseite abgestimmt und getestet
- [ ] parallele Checkout-Erstellung, Session-Rotation, verspätete Zahlung sowie zwei bezahlte Bestellungen mit Refunds in beiden Reihenfolgen getestet
- [ ] genau eine Stripe-Customer-ID je Benutzerkonto; Customer-Lease und Abrechnungs-Fingerprint in der Produktionsdatenbank aktiv
- [ ] keine Karten-, IBAN- oder Payment-Element-Daten in Logs/Datenbank

## Kurs, Quiz und Zertifikat

- [ ] Stream-Videos verlangen signierte URLs und erlauben nur eigene Origins
- [ ] Token-Endpunkt prüft Sitzung, Enrollment und Lektion
- [ ] Token kurzlebig, nutzerbezogen, `no-store`, rate-limited
- [ ] `is_correct` fehlt in HTML, RSC-Payload, JSON und Client-Bundle
- [ ] manipulierte Question-/Option-IDs werden verworfen
- [ ] gleichzeitige Quizabgaben werden serialisiert/idempotent behandelt
- [ ] Zertifikatsbucket privat; Download erfordert Auth oder kurzlebige Signatur
- [ ] Zertifikatsnummer nicht fortlaufend; PDF-Hash gespeichert
- [ ] Doppelausstellung und doppelte E-Mails verhindert
- [ ] Fortschritt, Video-Sitzungen und Quizversuche sind versionsgebunden; alte Nachweise schalten keine neue Kursversion frei
- [ ] Abschluss-Snapshots sind unveränderlich, nicht direkt für normale Nutzerinnen lesbar/schreibbar und Zertifikate verweisen auf dieselbe Kursversion
- [ ] Legacy-Marker erzeugen keinen Abschluss-Snapshot; bestätigte Altzertifikate verlangen eine belegte historische Kursversion

## Plattform

- [ ] alle Secrets nur im Deployment-Secret-Store
- [ ] Supabase RLS mit Tests für eigene/fremde Datensätze
- [ ] Service Role niemals im Clientbundle
- [ ] CSP mit echten Stripe-/Cloudflare-Flows in Staging geprüft
- [ ] HSTS, `nosniff`, Referrer-Policy, Frame-Schutz und Permissions-Policy aktiv
- [ ] keine personenbezogenen Daten, Token oder Webhook-Payloads in Fehlerlogs
- [ ] Dependency Audit ohne High/Critical; Ausnahmen dokumentiert
- [ ] Backups und Restore praktisch getestet
- [ ] Audit Logs gegen Änderung durch normale Nutzerinnen geschützt
- [ ] Security- und Incident-Kontakt benannt
