# Transaktionale E-Mail

## DNS und Absender

- eigene Subdomain für Transaktionsmails verwenden
- SPF und DKIM beim Provider vollständig verifizieren
- DMARC zunächst beobachten, danach schrittweise verschärfen
- `EMAIL_FROM` mit erreichbarer Reply-To-/Supportadresse konfigurieren
- keine `noreply`-Adresse verwenden, wenn Antworten unterstützt werden

## Vorlagen und Ereignisse

Die Anwendung unterscheidet Aktivierung, vollständigen Kursabschluss und fertiges Zertifikat. Jede Mail besitzt HTML- und Plain-Text-Inhalt. Der Zertifikatsversand enthält PDF-Anhang und kurzlebigen Download-Link.

`email_deliveries.event_key` ist eindeutig. Retries dürfen denselben Event Key nicht als neue fachliche Nachricht behandeln. Provider-ID, Status und minimierte Fehlermeldung werden gespeichert; API-Key, vollständige Payload und Anhang werden nicht geloggt.

## Fehlerbehandlung

- temporärer Providerfehler: idempotenter Retry
- Anhang zu groß: Mail ohne Anhang mit sicherem Download-Link senden und Fehler für Admin sichtbar machen
- permanente Ablehnung: Adminstatus und Supportprozess
- erneuter Adminversand: neuer expliziter Re-Send-Event Key plus Audit Log

## Abnahme

Versand in üblichen Desktop-/Mobile-Clients prüfen, Plain-Text testen, Links auf korrekte HTTPS-Domain prüfen und sicherstellen, dass keine Marketinginhalte ohne gesonderte Einwilligung enthalten sind.
