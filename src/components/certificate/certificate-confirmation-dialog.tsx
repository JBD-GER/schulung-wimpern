"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Award, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

const CONFIRMATION_TIMEOUT_MS = 30_000;

export function CertificateConfirmationDialog({
  suggestedName,
  openInitially = true,
  className,
}: {
  suggestedName: string;
  openInitially?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(openInitially);
  const [participantName, setParticipantName] = useState(suggestedName);
  const [singleIssuanceConfirmed, setSingleIssuanceConfirmed] = useState(false);
  const [correctionFeeNoticeConfirmed, setCorrectionFeeNoticeConfirmed] =
    useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedName = participantName.trim().replace(/\s+/gu, " ");
  const completeName = useMemo(
    () =>
      normalizedName.length >= 2 &&
      normalizedName.length <= 160 &&
      normalizedName.split(/\s+/u).length >= 2,
    [normalizedName],
  );
  const canSubmit =
    completeName &&
    singleIssuanceConfirmed &&
    correctionFeeNoticeConfirmed &&
    !submitting;

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      CONFIRMATION_TIMEOUT_MS,
    );
    try {
      const response = await fetch("/api/certificate/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: normalizedName,
          singleIssuanceConfirmed,
          correctionFeeNoticeConfirmed,
        }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "Das Zertifikat konnte nicht sicher ausgestellt werden.",
        );
      }
      setOpen(false);
      router.refresh();
    } catch (confirmationError) {
      setError(
        confirmationError instanceof DOMException &&
          confirmationError.name === "AbortError"
          ? "Die Anfrage hat zu lange gedauert. Deine Bestätigung wurde nicht erneut gesendet. Bitte versuche es noch einmal."
          : confirmationError instanceof Error
            ? confirmationError.message
            : "Die Bestätigung konnte nicht gespeichert werden.",
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  return (
    <div className={className}>
      <Button type="button" onClick={() => setOpen(true)}>
        <Award aria-hidden="true" className="size-4" />
        Zertifikatsdaten prüfen
      </Button>

      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!submitting) setOpen(nextOpen);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl focus:outline-none sm:p-8">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={submitting}
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-muted hover:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                aria-label="Dialog schließen"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>

            <span className="grid size-12 place-items-center rounded-xl bg-gold/15 text-navy">
              <Award aria-hidden="true" className="size-6" />
            </span>
            <Dialog.Title className="mt-5 pr-10 font-serif text-2xl font-semibold text-navy sm:text-3xl">
              Namen vor der Ausstellung bestätigen
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-muted">
              Prüfe sorgfältig, wie dein vollständiger Vor- und Nachname auf dem
              Zertifikat erscheinen soll. Erst deine ausdrückliche Bestätigung
              startet die einmalige Erstellung.
            </Dialog.Description>

            <form onSubmit={confirm} className="mt-6">
              <label
                htmlFor="certificate-participant-name"
                className="text-sm font-bold text-navy"
              >
                Vor- und Nachname auf dem Zertifikat
              </label>
              <input
                id="certificate-participant-name"
                name="participantName"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={160}
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                disabled={submitting}
                className="mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-navy shadow-sm focus:border-gold focus:outline-none"
                aria-describedby="certificate-name-preview"
              />
              <p
                id="certificate-name-preview"
                className="mt-3 rounded-xl border border-gold/25 bg-[#fffaf2] px-4 py-3 text-sm leading-6 text-navy"
              >
                Gedruckter Name: <strong>{normalizedName || "—"}</strong>
              </p>

              <div className="mt-5 rounded-xl border border-[#dbbf93] bg-[#fffaf2] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-[#8a6737]"
                  />
                  <p className="text-sm leading-6 text-[#6f552f]">
                    Nach der Ausstellung bleibt das Zertifikat unveränderlich.
                    Eine spätere Namenskorrektur ist nicht automatisch möglich,
                    sondern muss separat durch den Support geprüft werden. Ein
                    solcher Prozess kann kostenpflichtig sein.
                  </p>
                </div>
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-navy">
                <input
                  type="checkbox"
                  checked={singleIssuanceConfirmed}
                  onChange={(event) =>
                    setSingleIssuanceConfirmed(event.target.checked)
                  }
                  disabled={submitting}
                  className="mt-1 size-4 shrink-0 accent-navy"
                />
                <span>
                  Ich bestätige, dass der oben angezeigte Vor- und Nachname
                  vollständig und richtig ist und das Zertifikat nur einmal
                  automatisch ausgestellt wird.
                </span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-6 text-navy">
                <input
                  type="checkbox"
                  checked={correctionFeeNoticeConfirmed}
                  onChange={(event) =>
                    setCorrectionFeeNoticeConfirmed(event.target.checked)
                  }
                  disabled={submitting}
                  className="mt-1 size-4 shrink-0 accent-navy"
                />
                <span>
                  Ich habe verstanden, dass eine spätere Korrektur eine separate
                  Supportprüfung erfordert und dieser Prozess kostenpflichtig
                  sein kann.
                </span>
              </label>

              {error ? (
                <p
                  className="mt-4 rounded-xl bg-danger/[.065] px-4 py-3 text-sm leading-6 text-danger"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <Button variant="secondary" disabled={submitting}>
                    Noch nicht ausstellen
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={!canSubmit}>
                  {submitting ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Award aria-hidden="true" className="size-4" />
                  )}
                  {submitting
                    ? "Zertifikat wird erstellt …"
                    : "Verbindlich bestätigen und ausstellen"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
