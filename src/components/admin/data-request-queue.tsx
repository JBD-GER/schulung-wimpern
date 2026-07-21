"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button } from "@/components/ui/button";

type RequestStatus =
  "requested" | "verified" | "processing" | "completed" | "rejected";
type RequestType = "export" | "deletion" | "correction";

type DataRequestRow = {
  id: string;
  userId: string;
  type: RequestType;
  status: RequestStatus;
  requestedAt: string | null;
  completedAt: string | null;
  participant: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
};

type PendingChange = {
  row: DataRequestRow;
  status: Exclude<RequestStatus, "requested">;
};

const statusOptions: Array<{
  value: Exclude<RequestStatus, "requested">;
  label: string;
}> = [
  { value: "verified", label: "Identität geprüft" },
  { value: "processing", label: "In Bearbeitung" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "rejected", label: "Abgelehnt" },
];

const filterOptions: Array<{
  value: "" | "all" | RequestStatus;
  label: string;
}> = [
  { value: "", label: "Offene Anfragen" },
  { value: "all", label: "Alle Anfragen" },
  { value: "requested", label: "Neu" },
  { value: "verified", label: "Verifiziert" },
  { value: "processing", label: "In Bearbeitung" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "rejected", label: "Abgelehnt" },
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isStatus(value: string | null): value is RequestStatus {
  return (
    value === "requested" ||
    value === "verified" ||
    value === "processing" ||
    value === "completed" ||
    value === "rejected"
  );
}

function isType(value: string | null): value is RequestType {
  return value === "export" || value === "deletion" || value === "correction";
}

function parseRequest(value: unknown): DataRequestRow | null {
  const item = record(value);
  const id = text(item?.id);
  const userId = text(item?.userId ?? item?.user_id);
  const type = text(item?.type ?? item?.requestType ?? item?.request_type);
  const status = text(item?.status);
  if (!item || !id || !userId || !isType(type) || !isStatus(status))
    return null;
  const rawParticipant = record(item.participant);
  return {
    id,
    userId,
    type,
    status,
    requestedAt: text(item.requestedAt ?? item.requested_at),
    completedAt: text(item.completedAt ?? item.completed_at),
    participant: rawParticipant
      ? {
          firstName: text(
            rawParticipant.firstName ?? rawParticipant.first_name,
          ),
          lastName: text(rawParticipant.lastName ?? rawParticipant.last_name),
          email: text(rawParticipant.email),
        }
      : null,
  };
}

function parseRequests(value: unknown): DataRequestRow[] | null {
  const rows = record(value)?.requests;
  if (!Array.isArray(rows)) return null;
  const parsed = rows.map(parseRequest);
  return parsed.every((row): row is DataRequestRow => row !== null)
    ? parsed
    : null;
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

function participantName(row: DataRequestRow) {
  if (!row.participant) return "Profil nicht verfügbar";
  return (
    [row.participant.firstName, row.participant.lastName]
      .filter(Boolean)
      .join(" ") ||
    row.participant.email ||
    "Name nicht verfügbar"
  );
}

function typeLabel(type: RequestType) {
  if (type === "deletion") return "Löschung";
  if (type === "correction") return "Berichtigung";
  return "Datenexport";
}

function statusLabel(status: RequestStatus) {
  return (
    {
      requested: "Neu",
      verified: "Verifiziert",
      processing: "In Bearbeitung",
      completed: "Abgeschlossen",
      rejected: "Abgelehnt",
    } as const
  )[status];
}

function suggestedStatus(
  status: RequestStatus,
): Exclude<RequestStatus, "requested"> {
  if (status === "requested") return "verified";
  if (status === "verified") return "processing";
  if (status === "processing") return "completed";
  return "processing";
}

export function DataRequestQueue() {
  const [filter, setFilter] = useState<"" | "all" | RequestStatus>("");
  const [rows, setRows] = useState<DataRequestRow[]>([]);
  const [selections, setSelections] = useState<
    Record<string, Exclude<RequestStatus, "requested">>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    const suffix = filter ? `?status=${encodeURIComponent(filter)}` : "";
    void fetch(`/api/admin/data-requests${suffix}`, {
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
              : "Datenschutzanfragen konnten nicht geladen werden.",
          );
        const parsed = parseRequests(body);
        if (!parsed)
          throw new Error("Die Datenschutzanfragen sind unvollständig.");
        setRows(parsed);
        setSelections(
          Object.fromEntries(
            parsed.map((row) => [row.id, suggestedStatus(row.status)]),
          ),
        );
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Datenschutzanfragen konnten nicht geladen werden.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, reload]);

  async function updateStatus() {
    if (!pending) return;
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/data-requests/${encodeURIComponent(pending.row.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: pending.status }),
        },
      );
      const body = await response.json().catch(() => null);
      const message = record(body)?.message;
      if (!response.ok)
        throw new Error(
          typeof message === "string"
            ? message
            : "Der Anfragestatus konnte nicht geändert werden.",
        );
      const updatedStatus = pending.status;
      setPending(null);
      setResult({
        ok: true,
        message: `Die Datenschutzanfrage wurde auf „${statusLabel(updatedStatus)}“ gesetzt.`,
      });
      setLoading(true);
      setReload((value) => value + 1);
    } catch (saveError) {
      setPending(null);
      setResult({
        ok: false,
        message:
          saveError instanceof Error
            ? saveError.message
            : "Der Anfragestatus konnte nicht geändert werden.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section
        className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        aria-labelledby="data-request-title"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                id="data-request-title"
                className="font-serif text-xl font-semibold text-navy"
              >
                Anfragen-Queue
              </h2>
              <p className="mt-1 text-xs text-muted">
                Personenbezogene Anfragen mit bestätigtem Bearbeitungsstatus.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="data-request-filter">
              Anfragen filtern
            </label>
            <select
              id="data-request-filter"
              value={filter}
              onChange={(event) => {
                setLoading(true);
                setError(null);
                setResult(null);
                setFilter(event.target.value as "" | "all" | RequestStatus);
              }}
              className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-navy focus:border-navy focus:outline-none"
            >
              {filterOptions.map((option) => (
                <option key={option.value || "open"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <AdminLoading label="Datenschutzanfragen werden geladen" />
          ) : error ? (
            <AdminError message={error} />
          ) : !rows.length ? (
            <AdminEmpty
              title="Keine Anfragen in dieser Ansicht"
              description="Die Admin-API hat für den gewählten Status keine Datenschutzanfragen zurückgegeben."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[68rem] text-left text-sm">
                <thead>
                  <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                    <th className="px-4 py-3">Teilnehmerin</th>
                    <th className="px-4 py-3">Anfrage</th>
                    <th className="px-4 py-3">Eingang</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Abgeschlossen</th>
                    <th className="px-4 py-3 text-right">Bearbeiten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-4">
                        <span className="block font-semibold text-navy">
                          {participantName(row)}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {row.participant?.email ??
                            `Nutzer-ID ${row.userId.slice(0, 8)}…`}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-navy">
                        {typeLabel(row.type)}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {displayDate(row.requestedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "completed" ? "bg-success/10 text-success" : row.status === "rejected" ? "bg-danger/10 text-danger" : "bg-navy/5 text-muted"}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {displayDate(row.completedAt)}
                      </td>
                      <td className="px-4 py-4">
                        {row.status === "completed" ||
                        row.status === "rejected" ? (
                          <span className="block text-right text-xs font-semibold text-muted">
                            Endstatus erreicht
                          </span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <label
                              className="sr-only"
                              htmlFor={`request-status-${row.id}`}
                            >
                              Neuer Status für {participantName(row)}
                            </label>
                            <select
                              id={`request-status-${row.id}`}
                              value={
                                selections[row.id] ??
                                suggestedStatus(row.status)
                              }
                              onChange={(event) =>
                                setSelections((current) => ({
                                  ...current,
                                  [row.id]: event.target.value as Exclude<
                                    RequestStatus,
                                    "requested"
                                  >,
                                }))
                              }
                              className="min-h-10 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-navy focus:border-navy focus:outline-none"
                            >
                              {statusOptions.map((option) => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                  disabled={option.value === row.status}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setPending({
                                  row,
                                  status:
                                    selections[row.id] ??
                                    suggestedStatus(row.status),
                                })
                              }
                            >
                              <ClipboardCheck
                                aria-hidden="true"
                                className="size-4"
                              />
                              Übernehmen
                            </Button>
                          </div>
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
          Prüfe die Identität und gesetzliche Aufbewahrungspflichten, bevor eine
          Anfrage abgeschlossen oder abgelehnt wird.
        </p>
      </section>

      <Dialog.Root
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPending(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-muted hover:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                aria-label="Dialog schließen"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
            <span className="grid size-11 place-items-center rounded-xl bg-navy/5 text-navy">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
              Anfragestatus verbindlich ändern?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              Die {pending ? typeLabel(pending.row.type) : "Datenschutzanfrage"}{" "}
              von{" "}
              {pending ? participantName(pending.row) : "dieser Teilnehmerin"}{" "}
              wird auf „{pending ? statusLabel(pending.status) : "–"}“ gesetzt.
              Prüfe vor Abschluss oder Ablehnung die rechtlichen und
              organisatorischen Voraussetzungen.
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={saving}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button onClick={() => void updateStatus()} disabled={saving}>
                {saving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                )}
                {saving ? "Wird gespeichert …" : "Status verbindlich ändern"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
