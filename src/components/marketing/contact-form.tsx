"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type SubmissionState =
  | { kind: "idle"; message: "" }
  | { kind: "success" | "error"; message: string };

const fieldStyles =
  "mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink shadow-sm transition-colors placeholder:text-muted/55 hover:border-gold/50 focus:border-gold focus:outline-none";

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SubmissionState>({
    kind: "idle",
    message: "",
  });

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setPending(true);
    setState({ kind: "idle", message: "" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          topic: data.get("topic"),
          message: data.get("message"),
          privacyAccepted: data.get("privacyAccepted") === "on",
          website: data.get("website"),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ||
            "Deine Nachricht konnte gerade nicht gesendet werden.",
        );
      }

      form.reset();
      setState({
        kind: "success",
        message:
          result.message || "Danke! Deine Nachricht wurde sicher übermittelt.",
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Deine Nachricht konnte gerade nicht gesendet werden. Bitte versuche es erneut.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submitForm}
      className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-8"
      noValidate={false}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-navy">
          Dein Name
          <input
            className={fieldStyles}
            type="text"
            name="name"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
          />
        </label>
        <label className="text-sm font-bold text-navy">
          E-Mail-Adresse
          <input
            className={fieldStyles}
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
      </div>

      <label className="mt-5 block text-sm font-bold text-navy">
        Worum geht es?
        <select className={fieldStyles} name="topic" defaultValue="" required>
          <option value="" disabled>
            Thema auswählen
          </option>
          <option value="course">Frage zur Schulung</option>
          <option value="checkout">Buchung und Zahlung</option>
          <option value="access">Login und Zugang</option>
          <option value="certificate">Zertifikat</option>
          <option value="other">Anderes Anliegen</option>
        </select>
      </label>

      <label className="mt-5 block text-sm font-bold text-navy">
        Deine Nachricht
        <textarea
          className={`${fieldStyles} min-h-40 resize-y py-3`}
          name="message"
          minLength={10}
          maxLength={5000}
          required
        />
      </label>

      <div
        className="absolute -left-[10000px] top-auto size-px overflow-hidden"
        aria-hidden="true"
      >
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-muted">
        <input
          className="mt-1 size-4 shrink-0 accent-navy"
          type="checkbox"
          name="privacyAccepted"
          required
        />
        <span>
          Ich habe die{" "}
          <a
            href="/datenschutz"
            className="font-bold text-navy underline decoration-gold/60 underline-offset-2"
          >
            Datenschutzerklärung
          </a>{" "}
          gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung
          der Anfrage einverstanden.
        </span>
      </label>

      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {pending ? "Wird gesendet …" : "Nachricht senden"}
        </Button>
        <p className="text-xs leading-5 text-muted">
          Pflichtfelder helfen uns, deine Anfrage sicher zuzuordnen.
        </p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state.kind !== "idle" ? (
          <p
            className={
              state.kind === "success"
                ? "mt-5 flex items-start gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success"
                : "mt-5 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger"
            }
          >
            {state.kind === "success" ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : null}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
