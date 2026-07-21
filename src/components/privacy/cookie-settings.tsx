"use client";

import { BarChart3, CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { usePrivacyConsent } from "@/components/privacy/consent-manager";
import { Button } from "@/components/ui/button";

export function CookieSettings() {
  const { consent, saving, error, saveConsent, openSettings } =
    usePrivacyConsent();
  const [saved, setSaved] = useState(false);

  async function choose(analytics: boolean) {
    setSaved(false);
    if (await saveConsent(analytics)) setSaved(true);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-success/20 bg-success/5 p-5">
        <p className="flex items-center gap-2 font-bold text-navy">
          <ShieldCheck className="size-5 text-success" aria-hidden="true" />
          Notwendige Funktionen sind immer aktiv
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sie sichern deine Einwilligungsauswahl, Anmeldung, Sicherheit und den
          von dir gestarteten Checkout. Sie werden nicht für Werbung verwendet.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-navy">Notwendig</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Einwilligungsstatus, Supabase-Sitzung sowie Sicherheits- und
              Zahlungsfunktionen. Stripe wird erst im aktiv aufgerufenen
              Zahlungsschritt geladen.
            </p>
          </div>
          <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">
            Immer aktiv
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-bold text-navy">
              <BarChart3 className="size-4 text-gold" aria-hidden="true" />
              Anonyme Statistik
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Vercel Web Analytics misst nach deiner Einwilligung aggregierte
              Aufrufe öffentlicher Seiten und anonyme Schritte im
              Buchungsablauf. Geschützte Kurs-, Profil-, Admin- und
              Zahlungsbestätigungsseiten werden von automatischen Seitenaufrufen
              ausgeschlossen. Es entstehen keine Werbeprofile.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              consent?.analytics
                ? "bg-success/10 text-success"
                : "bg-beige text-muted"
            }`}
          >
            {consent?.analytics ? "Aktiv" : "Nicht aktiv"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5 opacity-80">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-navy">Marketing</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Es sind keine Werbe-, Remarketing- oder Social-Media-Pixel
              eingebunden.
            </p>
          </div>
          <span className="rounded-full bg-beige px-3 py-1 text-xs font-bold text-muted">
            Nicht eingesetzt
          </span>
        </div>
      </div>

      {saved ? (
        <p
          className="flex items-center gap-2 text-sm font-bold text-success"
          role="status"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Deine neue Auswahl wurde gespeichert und protokolliert.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          onClick={() => void choose(true)}
          disabled={saving}
        >
          Anonyme Statistik erlauben
        </Button>
        <Button
          variant="secondary"
          onClick={() => void choose(false)}
          disabled={saving}
        >
          Nur notwendige verwenden
        </Button>
        <Button variant="ghost" onClick={openSettings} disabled={saving}>
          Banner-Auswahl öffnen
        </Button>
      </div>

      {consent ? (
        <p className="text-xs leading-5 text-muted">
          Letzte Auswahl: {new Date(consent.updatedAt).toLocaleString("de-DE")}.
          Ein Widerruf wirkt für die Zukunft; die Rechtmäßigkeit der bis dahin
          erfolgten Verarbeitung bleibt unberührt.
        </p>
      ) : null}
    </div>
  );
}
