# SEO-Weiterleitungsplan

Die bekannte Basismigration ist in `next.config.ts` hinterlegt. Vor Domainumschaltung muss ein Crawl/Export der tatsächlich bestehenden Website ergänzt werden. Search Console, Serverlogs, Sitemap und Backlinkdaten sind dafür maßgeblich.

| Alte URL / Muster                   | Ziel                                                     | Status | Begründung                                                  |
| ----------------------------------- | -------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `/registrieren`                     | `/checkout`                                              | 301    | direkte neue Buchungsstrecke                                |
| `/register`                         | `/checkout`                                              | 301    | Sprach-/Altsystemvariante                                   |
| `/anmelden`                         | `/login`                                                 | 301    | konsistente Login-URL                                       |
| `/kurs`                             | angemeldet: `/schulung`; sonst `/login?next=%2Fschulung` | 301    | direktes, sitzungsabhängiges Ziel ohne zweite Weiterleitung |
| `/online-kurs-wimpernverlaengerung` | `/#inhalte`                                              | 301    | Inhalt bleibt auf zentraler Verkaufsseite                   |
| `/wimpernverlangerung-schulung`     | `/`                                                      | 301    | Schreibvariante ohne Umlautersatz                           |
| `/quiz/*`                           | angemeldet: `/schulung`; sonst `/login?next=%2Fschulung` | 301    | direktes, sitzungsabhängiges Ziel ohne zweite Weiterleitung |
| `/fragen`                           | `/fragen`                                                | 200    | relevante bestehende URL erhalten                           |

## Domainregeln

- `http://schulung-wimpernverlaengerung.de/*` → genau ein 301 auf `https://www.schulung-wimpernverlaengerung.de/*`
- `https://schulung-wimpernverlaengerung.de/*` → genau ein 301 auf die www-Variante
- Query-Parameter nur erhalten, wenn fachlich erforderlich; niemals Auth-/Access-Token übernehmen

## Prüfung

Vor und nach Launch alle alten URLs automatisiert abrufen. Erwartet werden direkte 301-Ziele ohne Kette, echte 404 für nicht zuordenbare Inhalte, keine Soft-404 und keine geschützten URLs in der Sitemap. Canonicals müssen auf die finale HTTPS-URL zeigen.
