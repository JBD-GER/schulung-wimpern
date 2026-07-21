# Cloudflare Stream

## Videoeinrichtung

Für jede der sieben Lektionen:

1. Originalvideo in Stream laden.
2. `requireSignedURLs: true` aktivieren.
3. erlaubte Origins auf die kanonische Produktions- und gegebenenfalls getrennte Staging-Domain begrenzen. Für die lokale Abnahme dürfen zusätzlich `localhost:3000` und `127.0.0.1:3000` gesetzt sein; bei Cloudflare gehört der Port ausdrücklich dazu.
4. deutsche Untertitel hochladen und Wiedergabe prüfen.
5. Download-Freigaben deaktivieren; keine öffentliche MP4-URL verwenden.
6. Video-UID ausschließlich im serverseitig geschützten Lektionsdatensatz speichern.
7. Verarbeitung abwarten, dann UID über den Adminbereich zuordnen.

## Signierschlüssel

Erzeuge nach der [offiziellen Stream-Anleitung](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/) einen Signing-Key. Cloudflare liefert `pem` und `jwk` Base64-kodiert; speichere einen dieser unveränderten Werte in `CLOUDFLARE_STREAM_SIGNING_KEY` und die zugehörige `id` in `CLOUDFLARE_STREAM_SIGNING_KEY_ID`. Alternativ akzeptiert die Anwendung ein dekodiertes privates JWK/PEM oder das vollständige Key-Resultat. Private Key und Key-ID gehören ausschließlich in den Secret Store. Der Token-Endpunkt prüft vor jeder Ausstellung:

- gültige Sitzung
- aktives Enrollment
- sequenzielle Freischaltung der Lektion
- Rate Limit und optional parallele Sitzungen

Tokens bleiben etwa 60–90 Minuten gültig und werden benutzerbezogen nicht gecacht. Bei längerer Pause fordert der Player einen neuen Token an. Das Wasserzeichen zeigt nur maskierte Identifikatoren und darf keine vollständige E-Mail-Adresse offenlegen.

## Realistische Schutzwirkung

Signed URLs, kurze Gültigkeit, Domainbindung und Wasserzeichen erschweren das Teilen von Zugangsdaten und direkten Links. Bildschirmaufnahmen können technisch nicht vollständig verhindert werden. „Rechtsklick deaktivieren“ ist kein Sicherheitsmechanismus.

## Abnahme

- nicht angemeldet: kein Token
- angemeldet ohne Enrollment: kein Token
- gesperrte Lektion: kein Token
- aktive, freigeschaltete Lektion: kurzlebiger Token
- Token nach Ablauf ungültig
- fremde Domain kann Player nicht einbetten
- Untertitel und Tastatursteuerung funktionieren
