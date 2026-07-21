"use client";

import {
  AlertCircle,
  BadgeCheck,
  LoaderCircle,
  Search,
  ShieldX,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";

type Result = {
  valid: boolean;
  status: "valid" | "revoked" | "not_found";
  certificateNumber?: string;
  courseName?: string;
  issuedAt?: string;
  participantInitials?: string;
};

export function VerificationForm() {
  const searchParams = useSearchParams();
  const [number, setNumber] = useState(
    searchParams.get("nummer")?.toUpperCase() ?? "",
  );
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function verify(value: string, proof?: string | null) {
    const normalized = value.trim().toUpperCase();
    if (!/^SWV-[0-9]{4}-[A-Z0-9]{6,16}$/.test(normalized)) {
      setError(
        "Bitte gib eine vollständige Zertifikatsnummer im Format SWV-JJJJ-XXXXXX ein.",
      );
      setResult(null);
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const query = new URLSearchParams({ number: normalized });
      if (proof) query.set("proof", proof);
      const response = await fetch(
        `/api/certificates/verify?${query.toString()}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => ({}))) as Result & {
        message?: string;
      };
      if (!response.ok) {
        setError(
          data.message ??
            "Die Prüfung ist gerade nicht möglich. Bitte versuche es später erneut.",
        );
        return;
      }
      setResult(data);
    } catch {
      setError(
        "Die Prüfung ist gerade nicht möglich. Bitte kontrolliere deine Verbindung und versuche es erneut.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = searchParams.get("nummer");
    if (!initial) return;

    // Die Prüfung startet nach dem initialen Render. Das hält den Effekt auf die
    // Synchronisation mit dem URL-Parameter beschränkt und vermeidet einen
    // zusätzlichen synchronen Renderzyklus.
    const timeout = window.setTimeout(
      () => void verify(initial, searchParams.get("proof")),
      0,
    );
    return () => window.clearTimeout(timeout);
    // Der QR-Parameter wird beim ersten Laden geprüft; spätere Eingaben laufen über das Formular.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void verify(number);
  }

  return (
    <div>
      <form
        onSubmit={submit}
        className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-7"
      >
        <Field
          label="Zertifikatsnummer"
          name="certificate-number"
          value={number}
          onChange={(event) => setNumber(event.target.value.toUpperCase())}
          placeholder="SWV-2026-8F4K2P"
          autoComplete="off"
          spellCheck={false}
          error={error || undefined}
          hint="Du findest die Nummer unten auf dem Zertifikat oder öffnest direkt den dort abgebildeten QR-Code."
        />
        <Button
          type="submit"
          size="lg"
          className="mt-5 w-full sm:w-auto"
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-5" aria-hidden="true" />
          )}
          Zertifikat prüfen
        </Button>
      </form>

      <div className="mt-7" aria-live="polite">
        {result?.status === "valid" && result.valid && (
          <div className="rounded-2xl border border-success/25 bg-success/5 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-success text-white">
                <BadgeCheck className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-extrabold tracking-[0.15em] text-success uppercase">
                  Gültiges Zertifikat
                </p>
                <h2 className="mt-2 font-serif text-2xl font-semibold text-navy">
                  Abschluss erfolgreich verifiziert
                </h2>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 border-t border-success/15 pt-6 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  Zertifikatsnummer
                </dt>
                <dd className="mt-1 font-bold text-navy">
                  {result.certificateNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  Ausstellungsdatum
                </dt>
                <dd className="mt-1 font-bold text-navy">
                  {result.issuedAt
                    ? new Intl.DateTimeFormat("de-DE", {
                        dateStyle: "long",
                      }).format(new Date(result.issuedAt))
                    : "–"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                  Kurs
                </dt>
                <dd className="mt-1 font-bold text-navy">
                  {result.courseName}
                </dd>
              </div>
              {result.participantInitials && (
                <div>
                  <dt className="text-xs font-bold tracking-wide text-muted uppercase">
                    Teilnehmerin
                  </dt>
                  <dd className="mt-1 font-bold text-navy">
                    {result.participantInitials}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
        {result?.status === "revoked" && (
          <div className="rounded-2xl border border-danger/25 bg-danger/5 p-6">
            <div className="flex gap-4">
              <ShieldX
                className="size-8 shrink-0 text-danger"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-serif text-2xl font-semibold text-navy">
                  Zertifikat nicht gültig
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Dieses Zertifikat wurde widerrufen. Bei Rückfragen wende dich
                  mit der Zertifikatsnummer an den Support.
                </p>
              </div>
            </div>
          </div>
        )}
        {result?.status === "not_found" && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <div className="flex gap-4">
              <AlertCircle
                className="size-7 shrink-0 text-gold"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-serif text-2xl font-semibold text-navy">
                  Kein gültiger Eintrag gefunden
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Prüfe die Schreibweise und versuche es erneut. Eine unbekannte
                  Nummer bestätigt keinen Kursabschluss.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
