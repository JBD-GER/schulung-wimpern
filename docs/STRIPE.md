# Stripe-Konfiguration

Die Anwendung nutzt Stripe SDK 22.3.2 mit gepinnter API-Version `2026-06-24.dahlia`. Diese Version unterstützt Checkout Sessions im `ui_mode: elements`. Produktname, Betrag, Währung, Steuerdarstellung und Bestellvalidierung kommen aus der einen `STRIPE_PRICE_ID`; kein UI enthält einen Ersatzbetrag. Der verbindliche Gesamtbetrag wird erst aus `amount_total` und `total_details.amount_tax` der konkreten Checkout Session angezeigt. Solange Stripe Tax noch Standortdaten benötigt oder Beträge fehlen, bleibt die Zahlungsaktion gesperrt und die Session wird ausschließlich nach Konto-/Bestellzuordnung serverseitig aktualisiert.

## Dashboard

1. Genau ein Produkt für die Online-Schulung anlegen.
2. Genau einen aktiven, nicht wiederkehrenden Preis auswählen und Product-/Price-ID als Secrets setzen.
3. Dynamische Zahlungsmethoden für das Zielland konfigurieren; keine Methodenliste im Code erzwingen.
4. Rechnungen für Einmalzahlungen und erforderliche Unternehmensangaben konfigurieren.
5. Steuerverhalten des Price und optional Stripe Tax fachlich prüfen.
6. Branding, Rechnungsfooter, Supportadresse und rechtliche Unternehmensdaten pflegen.
7. Apple Pay/Google Pay-Domainverifikation für die kanonische Domain durchführen.

## Webhook

Ziel: `https://www.schulung-wimpernverlaengerung.de/api/webhooks/stripe`

Im Stripe-Workbench unter **Webhooks → Create an event destination** eine
Destination für **Your account**, Snapshot-Events und die zum SDK passende
API-Version `2026-06-24.dahlia` anlegen. Für diesen Endpoint exakt folgende
Ereignisse auswählen:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `refund.created`
- `refund.updated`
- `charge.dispute.created`

`charge.refunded` wird vom Handler nur als rückwärtskompatibler Fallback
verstanden und muss für einen neu eingerichteten Endpoint nicht zusätzlich
abonniert werden. `charge.dispute.closed` stellt den Zugang absichtlich nicht
automatisch wieder her; ein geschlossener Streitfall muss vor einer manuellen
Entscheidung im Stripe-Dashboard geprüft werden. `invoice.payment_failed` gehört
nicht zu diesem Einmalzahlungsablauf: Die Post-Purchase-Rechnung wird erst nach
erfolgreicher Zahlung erzeugt.

Den Signing Secret getrennt für Test und Live setzen. Der angezeigte Secret
gehört genau zu dieser Destination und muss als `STRIPE_WEBHOOK_SECRET` im
jeweiligen Deployment gesetzt werden. Der Handler verwendet den unveränderten
Rohbody, prüft die Stripe-Signatur und beansprucht jedes `event.id` nur einmal.

### Bezahlte Rechnungen

Die Checkout Session ist für eine Einmalzahlung korrekt mit
`mode: "payment"`, `ui_mode: "elements"` und
`invoice_creation.enabled: true` konfiguriert. Stripe erzeugt die bezahlte
Rechnung nach erfolgreicher Zahlung; bei verzögerten Zahlarten kann das später
als `checkout.session.completed` geschehen. Deshalb gleicht `invoice.paid` die
Rechnungs-ID nachträglich ab. Vor dem Speichern werden Order, Nutzer, Kurs,
Price, Rechnungsfingerabdruck, Customer, Checkout Session, Payment Intent,
Betrag und Währung erneut bei Stripe und gegen die lokale Bestellung geprüft.
Ein bloßes `invoice.metadata.order_id` genügt ausdrücklich nicht.

Lokal wird nur die Stripe-Rechnungs-ID dauerhaft gespeichert. Nummer und
signierter PDF-/Hosted-Invoice-Link werden im authentifizierten Profil
serverseitig direkt von Stripe geladen und ausschließlich dem Eigentümer der
Bestellung angezeigt. Dadurch werden keine öffentlich erreichbaren
Rechnungslinks in Clientdaten oder Exporte kopiert.

Vor dem Go-live im Stripe-Dashboard zwingend prüfen:

1. Unter **Customer emails** die E-Mail für erfolgreiche Zahlungen aktivieren,
   damit Stripe die Rechnungszusammenfassung versendet.
2. Öffentliche Unternehmensdaten, Anschrift, Supportkontakt, Branding,
   Rechnungsnummern, Footer und gegebenenfalls die eigene Steuer-ID im
   Rechnungstemplate vollständig und fachlich freigeben.
3. Den einmaligen Price auf korrektes Steuerverhalten prüfen. Bei aktiviertem
   Stripe Tax zusätzlich die erforderlichen Registrierungen und die daraus
   entstehenden Testrechnungen fachlich/steuerlich abnehmen.
4. Einen privaten und einen geschäftlichen Testkauf ausführen und in Checkout,
   Payment Intent, Rechnung, PDF und lokalem Bestellprofil jeweils Empfänger,
   Position, Netto-/Steuer-/Gesamtbetrag und Währung vergleichen.

Ein Price mit `tax_behavior=unspecified`, deaktiviertem Automatic Tax oder
fehlenden Tax-Registrierungen ist ohne diese fachliche Prüfung kein belastbarer
Go-live-Nachweis. Der Quellcode kann die steuerliche und handelsrechtliche
Freigabe der Stripe-Kontoeinstellungen nicht ersetzen.

## Lokaler Test

```bash
stripe login
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,invoice.paid,refund.created,refund.updated,charge.dispute.created \
  --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

Ein generisches Trigger-Ereignis enthält nicht zwingend die projektspezifische Price-/User-Metadatenstruktur. Für die vollständige Prüfung einen echten Testkauf ausführen und das konkrete Ereignis mit Stripe CLI erneut senden.

## Unverzichtbare Assertions

Vor Aktivierung müssen Price-ID, erwartete Product-ID, Währung, Betrag, Customer/User-Zuordnung und `payment_status=paid` serverseitig stimmen. Der Browser-Return und ein bloß vorhandener Payment Intent reichen nicht. Verzögerte Methoden werden erst bei `async_payment_succeeded` aktiviert.

Pro Benutzerkonto existiert genau ein dauerhaft zugeordneter Stripe Customer. Ein datenbankweiter, kurzlebiger Lease serialisiert Änderungen an Name, Adresse und Steuer-IDs über alle App-Instanzen, wird vor jeder Stripe-Mutation erneuert und fenced das Profilupdate atomar. Fehlt die lokale Zuordnung nach einem früheren unklaren Fehler, listet der Server vor einer Neuanlage alle Stripe Customer paginiert und übernimmt nur den eindeutig über `metadata.user_id` passenden Datensatz; mehrere Treffer stoppen fail-closed zur manuellen Konsolidierung.

Der kanonische Rechnungssnapshot erhält einen SHA-256-Fingerprint; Order, Checkout Session, Payment Intent und Rechnung tragen denselben Wert. Bei geänderten Rechnungsdaten bleibt die alte Stripe Session ein persistenter Rotationsblocker. Eine nach einem verlorenen API-Ergebnis nur remote vorhandene Session wird vor jeder Customer-Mutation gesucht und zuerst atomar an ihre Order gebunden. Der Customer darf erst mutiert und eine neue Session erst erzeugt werden, wenn Stripe die alte Session als `expired` bestätigt oder ein signiertes Async-Failure-Ereignis verarbeitet wurde. Eine parallel bereits bezahlte alte Session gewinnt die Enrollment-Zuordnung; der Return-Tab erteilt niemals selbst Zugang und weist eine echte Doppelzahlung ausdrücklich zur Supportklärung aus.

Rückerstattung/Dispute ändern den Zugang entsprechend der verbindlich festgelegten Geschäftsregel; steuer- und handelsrechtlich aufzubewahrende Bestelldaten werden dabei nicht gelöscht.

Teste in Staging zusätzlich zwei parallele Checkout-POSTs mit unterschiedlichen Rechnungsdaten, fehlgeschlagene Stripe-Expiration, `async_payment_failed` nach Rotation, Zahlung der alten Session während der Rotation sowie zwei erfolgreiche Charges mit Rückerstattungen in beiden Reihenfolgen. Prüfe dabei Customer-Anzahl, Rechnungsempfänger, Order-Fingerprint, Enrollment-Gewinner und den endgültigen Zugangsstatus.

Bei einem Upgrade eines bereits zahlungsaktiven Systems gilt zusätzlich der verpflichtende Drain- und Evidenz-Preflight aus [Deployment](DEPLOYMENT.md): Der neue Handler darf erst live gehen, wenn jede ältere Stripe Session und jeder Payment Intent inventarisiert, offene Sessions beendet und die aufbewahrten Objekte mit exakt demselben lokalen und entfernten Kurs-/Fingerprint-Nachweis versehen wurden. Migration 004 erzwingt fail-closed die lokale Evidenzschranke; die Vollständigkeit des entfernten Stripe-Inventars bleibt ein gesondert zu protokollierender operativer Pflichtschritt.
