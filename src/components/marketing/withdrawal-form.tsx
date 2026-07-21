"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const DECLARATION_TEXT =
  "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Online-Schulung Wimpernverlängerung.";

const fieldStyles =
  "mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink shadow-sm transition-colors placeholder:text-muted/55 hover:border-gold/50 focus:border-gold focus:outline-none";

interface WithdrawalDetails {
  consumerName: string;
  contractReference: string;
  confirmationEmail: string;
}

interface Receipt {
  receiptNumber: string;
  receivedAt: string;
}

type Notice =
  | { kind: "idle"; message: "" }
  | { kind: "error" | "warning"; message: string };

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function formatReceiptTime(value: string): string {
  const receivedAt = new Date(value);
  if (Number.isNaN(receivedAt.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  }).format(receivedAt);
}

export function WithdrawalForm() {
  const [step, setStep] = useState<"details" | "review" | "success">("details");
  const [details, setDetails] = useState<WithdrawalDetails>({
    consumerName: "",
    contractReference: "",
    confirmationEmail: "",
  });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "idle", message: "" });
  const submissionId = useRef<string | null>(null);

  function reviewDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDetails((current) => ({
      consumerName: normalize(current.consumerName),
      contractReference: normalize(current.contractReference),
      confirmationEmail: current.confirmationEmail.trim().toLowerCase(),
    }));
    setNotice({ kind: "idle", message: "" });
    setStep("review");
  }

  async function confirmWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice({ kind: "idle", message: "" });
    submissionId.current ??= window.crypto.randomUUID();

    try {
      const response = await fetch("/api/withdrawal", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submissionId.current,
          ...details,
          confirmation: "withdrawal_confirmed",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        recorded?: boolean;
        emailSent?: boolean;
        message?: string;
        receiptNumber?: string;
        receivedAt?: string;
      } | null;

      if (
        result?.recorded &&
        typeof result.receiptNumber === "string" &&
        typeof result.receivedAt === "string"
      ) {
        setReceipt({
          receiptNumber: result.receiptNumber,
          receivedAt: result.receivedAt,
        });
      }

      if (!response.ok || !result?.ok || !result.emailSent) {
        if (result?.recorded) {
          setNotice({
            kind: "warning",
            message:
              result.message ||
              "Dein Widerruf ist eingegangen, aber die E-Mail-Bestätigung konnte noch nicht versendet werden. Bitte versuche den Versand erneut.",
          });
          return;
        }
        throw new Error(
          result?.message ||
            "Dein Widerruf konnte gerade nicht übermittelt werden. Bitte versuche es erneut.",
        );
      }

      setStep("success");
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Dein Widerruf konnte gerade nicht übermittelt werden. Bitte versuche es erneut.",
      });
    } finally {
      setPending(false);
    }
  }

  if (step === "success" && receipt) {
    return (
      <div
        className="rounded-2xl border border-success/30 bg-success/8 p-5 sm:p-6"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 size-6 shrink-0 text-success"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-lg font-extrabold text-navy">
              Dein Widerruf ist eingegangen
            </h3>
            <p className="mt-2 text-sm leading-6 text-ink/75">
              Eingang am {formatReceiptTime(receipt.receivedAt)}. Die
              Eingangsbestätigung mit dem vollständigen Inhalt deiner Erklärung
              wurde an <strong>{details.confirmationEmail}</strong> gesendet.
            </p>
            <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-ink/75">
              <strong>Eingangsnummer:</strong> {receipt.receiptNumber}
            </p>
            <p className="mt-3 text-xs leading-5 text-muted">
              Bewahre die Eingangsbestätigung auf. Sie bestätigt den Eingang;
              die weitere Bearbeitung und die gesetzlichen Folgen werden
              gesondert geprüft.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gold/35 bg-ivory p-5 sm:p-6">
      <ol
        className="mb-6 ml-0! grid list-none! grid-cols-2 gap-3 text-xs font-extrabold tracking-[0.08em] uppercase"
        aria-label="Schritte des elektronischen Widerrufs"
      >
        <li
          className={
            step === "details"
              ? "rounded-lg bg-navy px-3 py-2 text-white"
              : "rounded-lg bg-white px-3 py-2 text-muted"
          }
          aria-current={step === "details" ? "step" : undefined}
        >
          1. Angaben
        </li>
        <li
          className={
            step === "review"
              ? "rounded-lg bg-navy px-3 py-2 text-white"
              : "rounded-lg bg-white px-3 py-2 text-muted"
          }
          aria-current={step === "review" ? "step" : undefined}
        >
          2. Bestätigen
        </li>
      </ol>

      {step === "details" ? (
        <form onSubmit={reviewDetails} noValidate={false}>
          <h3 className="text-lg font-extrabold text-navy">
            Vertrag eindeutig zuordnen
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Eine Begründung ist nicht erforderlich. Wir benötigen nur deinen
            Namen, eine Angabe zum Vertrag und die E-Mail-Adresse für die
            Eingangsbestätigung.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-bold text-navy">
              Vor- und Nachname
              <input
                className={fieldStyles}
                type="text"
                name="consumerName"
                autoComplete="name"
                minLength={2}
                maxLength={160}
                value={details.consumerName}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    consumerName: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="text-sm font-bold text-navy">
              E-Mail für die Eingangsbestätigung
              <input
                className={fieldStyles}
                type="email"
                name="confirmationEmail"
                autoComplete="email"
                maxLength={254}
                value={details.confirmationEmail}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    confirmationEmail: event.target.value,
                  }))
                }
                required
              />
            </label>
          </div>

          <label className="mt-5 block text-sm font-bold text-navy">
            Vertragsidentifikation
            <input
              className={fieldStyles}
              type="text"
              name="contractReference"
              autoComplete="off"
              minLength={3}
              maxLength={240}
              placeholder="z. B. Bestellnummer, Rechnungsnummer oder Buchungs-E-Mail"
              value={details.contractReference}
              onChange={(event) =>
                setDetails((current) => ({
                  ...current,
                  contractReference: event.target.value,
                }))
              }
              aria-describedby="withdrawal-reference-hint"
              required
            />
            <span
              id="withdrawal-reference-hint"
              className="mt-2 block text-xs leading-5 font-normal text-muted"
            >
              Bitte keine Zahlungs- oder Passwortdaten eintragen.
            </span>
          </label>

          <p className="mt-5 text-xs leading-5 text-muted">
            Hinweise zur Verarbeitung deiner Angaben findest du in der{" "}
            <a href="/datenschutz">Datenschutzerklärung</a>.
          </p>
          <Button type="submit" size="lg" className="mt-6 w-full sm:w-auto">
            Angaben prüfen
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmWithdrawal}>
          <h3 className="text-lg font-extrabold text-navy">
            Widerruf verbindlich bestätigen
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Prüfe die Angaben. Mit dem Button „Widerruf bestätigen“ übermittelst
            du deine Widerrufserklärung verbindlich.
          </p>

          <dl className="mt-5 grid gap-4 rounded-xl border border-line bg-white p-4 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="font-bold text-navy">Name</dt>
            <dd className="break-words">{details.consumerName}</dd>
            <dt className="font-bold text-navy">Vertrag</dt>
            <dd className="break-words">{details.contractReference}</dd>
            <dt className="font-bold text-navy">Bestätigung an</dt>
            <dd className="break-all">{details.confirmationEmail}</dd>
          </dl>

          <div className="mt-5 rounded-xl border-l-4 border-gold bg-white px-4 py-4 text-sm leading-6 text-ink/85">
            <p className="font-bold text-navy">Inhalt deiner Erklärung</p>
            <p className="mt-2">{DECLARATION_TEXT}</p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {pending ? (
                <LoaderCircle
                  className="size-5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck className="size-5" aria-hidden="true" />
              )}
              {pending
                ? "Wird übermittelt …"
                : receipt
                  ? "E-Mail-Bestätigung erneut senden"
                  : "Widerruf bestätigen"}
            </Button>
            {!receipt ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={pending}
                onClick={() => {
                  setNotice({ kind: "idle", message: "" });
                  setStep("details");
                }}
                className="w-full sm:w-auto"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Angaben ändern
              </Button>
            ) : null}
          </div>

          <div aria-live="assertive" aria-atomic="true">
            {notice.kind !== "idle" ? (
              <div
                role="alert"
                className={
                  notice.kind === "warning"
                    ? "mt-5 rounded-xl border border-gold/35 bg-gold/10 px-4 py-3 text-sm leading-6 text-navy"
                    : "mt-5 rounded-xl bg-danger/10 px-4 py-3 text-sm leading-6 font-semibold text-danger"
                }
              >
                <p>{notice.message}</p>
                {receipt ? (
                  <p className="mt-2 font-semibold">
                    Eingang: {formatReceiptTime(receipt.receivedAt)} ·{" "}
                    {receipt.receiptNumber}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
