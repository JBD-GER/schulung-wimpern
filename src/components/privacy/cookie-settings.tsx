"use client";

import { CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "swv-consent-v1";

export function CookieSettings() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSaved(Boolean(window.localStorage.getItem(STORAGE_KEY)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  function save() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: "1.0",
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: new Date().toISOString(),
      }),
    );
    setSaved(true);
  }
  function reset() {
    window.localStorage.removeItem(STORAGE_KEY);
    setSaved(false);
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-success/20 bg-success/5 p-5">
        <p className="flex items-center gap-2 font-bold text-navy">
          <ShieldCheck className="size-5 text-success" />
          Nur technisch notwendige Dienste aktiv
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Aktuell setzen wir keine Analyse- oder Marketing-Cookies ein.
          Authentifizierungs-, Sicherheits- und Checkout-Funktionen werden nur
          auf den jeweils benötigten Seiten geladen.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-navy">Notwendige Speicherung</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Sitzung, Sicherheit, Checkout-Status und deine hier gespeicherte
              Datenschutzauswahl.
            </p>
          </div>
          <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">
            Immer aktiv
          </span>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-white p-5 opacity-75">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-navy">Analyse & Marketing</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Es sind keine entsprechenden Dienste eingebunden. Vor einer
              zukünftigen Aktivierung wäre deine ausdrückliche Einwilligung
              erforderlich.
            </p>
          </div>
          <span className="rounded-full bg-beige px-3 py-1 text-xs font-bold text-muted">
            Nicht aktiv
          </span>
        </div>
      </div>
      {saved && (
        <p
          className="flex items-center gap-2 text-sm font-bold text-success"
          role="status"
        >
          <CheckCircle2 className="size-4" />
          Deine Auswahl wurde lokal gespeichert.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={save}>Notwendige Auswahl speichern</Button>
        <Button variant="secondary" onClick={reset}>
          <RotateCcw className="size-4" />
          Lokale Auswahl zurücksetzen
        </Button>
      </div>
    </div>
  );
}
