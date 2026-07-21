# Datenschutz- und Cookie-Abnahme

Die Anwendung trennt notwendige Funktionen von freiwilliger Statistik:

- Vercel Web Analytics wird erst nach protokollierter Zustimmung geladen.
- Ohne Zustimmung wird kein Analytics-Script eingebunden.
- Automatische Seitenaufrufe aus Admin, Dashboard, Profil, Kurs, Zertifikat,
  Checkout, Zahlungsbestätigung und Auth-Bereichen werden verworfen.
- Erlaubte Checkout-Funnel-Ereignisse enthalten keine Namen, E-Mail-Adressen,
  Session-, Bestell-, Zahlungs- oder Zertifikatskennungen. Query-Parameter und
  URL-Fragmente werden vor dem Versand entfernt.
- Stripe wird unabhängig von der Statistik-Einwilligung erst im aktiv
  aufgerufenen Zahlungsschritt geladen. Seine notwendigen Zahlungs- und
  Betrugspräventionsspeicherungen sind keine Marketingfreigabe.

## Vor dem Produktionsstart

1. Für Vercel, Supabase, Cloudflare, Stripe und Resend die jeweils aktuellen
   DPA-/AVV-Unterlagen im richtigen Unternehmenskonto abschließen und
   exportieren. Unterauftragnehmerlisten und Drittlandmechanismen dokumentieren.
2. Die Supabase-Projektregion **eu-central-1** (Frankfurt) im produktiven Projekt
   erneut kontrollieren. Private Storage-Buckets und RLS dürfen nicht
   öffentlich gemacht werden.
3. Vercel Web Analytics im Produktionsprojekt aktivieren. In Preview und
   Produktion mit einem Browser-Netzwerkprotokoll prüfen:
   - vor einer Auswahl kein Analytics-Script,
   - bei „Nur notwendige“ weiterhin kein Analytics-Script,
   - nach Zustimmung nur öffentliche, bereinigte Pageviews,
   - nach Widerruf keine weiteren Analytics-Requests.
4. In Resend Öffnungs- und Linktracking für transaktionale Nachrichten
   deaktivieren. Dasselbe gilt für Supabase-Auth-Mails, weil umgeschriebene
   Einmal-Links die Anmeldung oder Wiederherstellung beeinträchtigen können.
5. Stripe nur mit den in **docs/STRIPE.md** beschriebenen Ereignissen,
   Rechnungsangaben und Steuerprüfungen freigeben. Keine zusätzlichen
   Werbeprodukte oder Marketing-Pixel aktivieren.
6. Cloudflare Stream ausschließlich mit signierten Videozugriffen und der
   kanonischen Domain betreiben. Keine öffentlichen Video-URLs in Lektionen
   speichern.
7. Lösch-, Auskunfts-, Widerrufs- und E-Mail-Fehlerprozesse im Adminbereich
   regelmäßig kontrollieren. Gesetzlich aufzubewahrende Rechnungs-,
   Bestell- und Widerrufsnachweise dürfen nicht durch eine pauschale
   Kontolöschung entfernt werden.

## Consent-Version

**NEXT_PUBLIC_COOKIE_CONSENT_VERSION** versioniert die Auswahl im Cookiebanner.
Jede wesentliche Änderung der optionalen Statistik, ihrer Datenpunkte oder
Empfänger benötigt eine neue Version. Dadurch wird erneut nach einer Auswahl
gefragt.

**CHECKOUT_CONSENT_VERSION** versioniert dagegen die rechtlichen Bestätigungen
der konkreten Bestellung. Beide Werte haben unterschiedliche Zwecke und dürfen
nicht zusammengelegt werden.

## Rechtliche Veröffentlichungsfreigabe

Die technischen Texte bleiben mit **LEGAL_TEXTS_APPROVED=false** im
Entwurfsmodus. Nach qualifizierter Prüfung:

1. Registerstatus und gegebenenfalls Registergericht/-nummer eintragen sowie
   ausdrücklich dokumentieren, ob bereits eine W-IdNr. zugeteilt wurde.
2. Die eigene Entscheidung zur Verbraucherstreitbeilegung als geprüften Text
   eintragen.
3. **npm run legal:hash** ausführen und den vollständigen Wert als
   **CHECKOUT_LEGAL_TEXT_HASH** setzen.
4. Erst dann **LEGAL_TEXTS_APPROVED=true** setzen.

Der Hash ist kein Geheimnis. Er ist der reproduzierbare Fingerabdruck der
freigegebenen Rechtstexte, der Zugangsregelung, der verbindlichen
Checkout-Erklärungen, des elektronischen Widerrufsformulars und der konkreten
Anbieterwerte aus `.env.local` beziehungsweise Vercel. Der Build berechnet
denselben Wert erneut und blockiert den Verkauf bei jeder Abweichung. Der Hash
wird zusammen mit der Checkout-Einwilligung gespeichert.

## Offizielle Anbieterinformationen

- Vercel DPA: <https://vercel.com/legal/dpa>
- Vercel Analytics Privacy: <https://vercel.com/docs/analytics/privacy-policy>
- Supabase Datenschutz: <https://supabase.com/privacy>
- Cloudflare DPA: <https://www.cloudflare.com/cloudflare-customer-dpa/>
- Stripe DPA: <https://stripe.com/legal/dpa>
- Stripe Cookie-Liste: <https://stripe.com/cookie-settings>
- Resend DPA: <https://resend.com/legal/dpa>
