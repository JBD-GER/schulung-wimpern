"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button } from "@/components/ui/button";

type EmailRow = {
  id: string;
  recipient: string | null;
  template: string | null;
  eventId: string | null;
  sentAt: string | null;
  createdAt: string | null;
  status: string | null;
  providerId: string | null;
  error: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayDate(value: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function parseRows(value: unknown): EmailRow[] | null {
  const root = record(value);
  const rows = root?.deliveries ?? root?.emails ?? root?.logs;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((row) => {
    const item = record(row);
    const id = text(item?.id);
    if (!item || !id) return [];
    return [
      {
        id,
        recipient: text(
          item.recipient ?? item.recipient_email ?? item.to_email,
        ),
        template: text(item.template ?? item.template_name),
        eventId: text(item.eventId ?? item.event_id ?? item.event_key),
        sentAt: text(item.sentAt ?? item.sent_at),
        createdAt: text(item.createdAt ?? item.created_at),
        status: text(item.status),
        providerId: text(
          item.providerId ?? item.provider_id ?? item.provider_message_id,
        ),
        error: text(item.error ?? item.error_message),
      },
    ];
  });
}

export function EmailLog() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<EmailRow | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/emails", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        const message = record(body)?.message;
        if (!response.ok)
          throw new Error(
            typeof message === "string"
              ? message
              : "E-Mail-Protokolle konnten nicht geladen werden.",
          );
        const parsed = parseRows(body);
        if (!parsed)
          throw new Error("Die E-Mail-Protokolle sind unvollständig.");
        setError(null);
        setRows(parsed);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "E-Mail-Protokolle konnten nicht geladen werden.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  async function retryDelivery() {
    if (!pending) return;
    setRetrying(true);
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/emails/${encodeURIComponent(pending.id)}/retry`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );
      const body = await response.json().catch(() => null);
      const message = record(body)?.message;
      if (!response.ok)
        throw new Error(
          typeof message === "string"
            ? message
            : "Die E-Mail konnte nicht erneut versendet werden.",
        );
      setPending(null);
      setResult({
        ok: true,
        message: `Die E-Mail an ${pending.recipient ?? "die Empfängerin"} wurde erneut versendet und protokolliert.`,
      });
      setLoading(true);
      setReload((value) => value + 1);
    } catch (retryError) {
      setPending(null);
      setResult({
        ok: false,
        message:
          retryError instanceof Error
            ? retryError.message
            : "Die E-Mail konnte nicht erneut versendet werden.",
      });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <section
        className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        aria-labelledby="email-log-title"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
              <Mail aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                id="email-log-title"
                className="font-serif text-xl font-semibold text-navy"
              >
                Versandereignisse
              </h2>
              <p className="mt-1 text-xs text-muted">
                Bestätigte Statusmeldungen des E-Mail-Providers.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoading(true);
              setError(null);
              setResult(null);
              setReload((value) => value + 1);
            }}
            disabled={loading}
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Aktualisieren
          </Button>
        </div>
        <div className="p-4 sm:p-5">
          {result ? (
            <p
              className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm leading-6 ${result.ok ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}
              role={result.ok ? "status" : "alert"}
            >
              {result.ok ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0"
                />
              ) : (
                <AlertCircle
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0"
                />
              )}
              {result.message}
            </p>
          ) : null}
          {loading ? (
            <AdminLoading label="E-Mail-Protokolle werden geladen" />
          ) : error ? (
            <AdminError message={error} />
          ) : !rows.length ? (
            <AdminEmpty
              title="Keine Versandereignisse"
              description="Die Admin-API hat aktuell keine protokollierten E-Mail-Ereignisse zurückgegeben."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[72rem] text-left text-sm">
                <thead>
                  <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                    <th className="px-4 py-3">Empfänger</th>
                    <th className="px-4 py-3">Vorlage</th>
                    <th className="px-4 py-3">Zeitpunkt</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Event / Provider</th>
                    <th className="px-4 py-3">Fehler</th>
                    <th className="px-4 py-3 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-4 font-semibold text-navy">
                        {row.recipient ?? "Nicht verfügbar"}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {row.template ?? "–"}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {displayDate(row.sentAt ?? row.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "sent" ? "bg-success/10 text-success" : row.status === "failed" ? "bg-danger/10 text-danger" : "bg-navy/5 text-muted"}`}
                        >
                          {row.status ?? "–"}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-mono text-[0.68rem] text-muted">
                        <span className="block">{row.eventId ?? "–"}</span>
                        <span className="mt-1 block">
                          {row.providerId ?? "–"}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-4 text-xs leading-5 text-danger">
                        {row.error ?? "–"}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {row.status === "failed" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setPending(row);
                              setResult(null);
                            }}
                          >
                            <Send aria-hidden="true" className="size-4" />
                            Erneut senden
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">–</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="border-t border-line bg-ivory px-5 py-4 text-xs leading-5 text-muted">
          Nur fehlgeschlagene Sendungen können erneut angestoßen werden. Der
          Server rekonstruiert den Inhalt aus den autoritativen Datensätzen und
          protokolliert jeden Versuch.
        </p>
      </section>

      <Dialog.Root
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !retrying) setPending(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={retrying}
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-muted hover:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                aria-label="Dialog schließen"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
            <span className="grid size-11 place-items-center rounded-xl bg-navy/5 text-navy">
              <Send aria-hidden="true" className="size-5" />
            </span>
            <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
              E-Mail erneut senden?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              Die Vorlage „{pending?.template ?? "nicht verfügbar"}“ wird erneut
              an {pending?.recipient ?? "die protokollierte Empfängeradresse"}{" "}
              gesendet. Der Versuch wird im Audit Log festgehalten.
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={retrying}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button onClick={() => void retryDelivery()} disabled={retrying}>
                {retrying ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Send aria-hidden="true" className="size-4" />
                )}
                {retrying ? "Wird gesendet …" : "Verbindlich erneut senden"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
