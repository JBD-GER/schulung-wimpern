"use client";

import { useEffect, useState } from "react";
import { FileClock, RefreshCw } from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button } from "@/components/ui/button";

type AuditRow = {
  id: string;
  actor: string | null;
  action: string | null;
  entity: string | null;
  entityId: string | null;
  createdAt: string | null;
};
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
        timeStyle: "medium",
      }).format(date);
}
function parseRows(value: unknown): AuditRow[] | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const rows = root.events ?? root.audit ?? root.entries ?? root.logs;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const id = text(item.id);
    if (!id) return [];
    return [
      {
        id,
        actor: text(
          item.actor ??
            item.actorEmail ??
            item.actor_email ??
            item.admin_email ??
            item.actor_id,
        ),
        action: text(item.action),
        entity: text(item.entity ?? item.entityType ?? item.entity_type),
        entityId: text(item.entityId ?? item.entity_id),
        createdAt: text(item.createdAt ?? item.created_at),
      },
    ];
  });
}

export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/audit", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            body && typeof body.message === "string"
              ? body.message
              : "Audit Log konnte nicht geladen werden.",
          );
        const parsed = parseRows(body);
        if (!parsed) throw new Error("Das Audit Log ist unvollständig.");
        setError(null);
        setRows(parsed);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Audit Log konnte nicht geladen werden.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  return (
    <section
      className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
      aria-labelledby="audit-log-title"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
            <FileClock aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              id="audit-log-title"
              className="font-serif text-xl font-semibold text-navy"
            >
              Kritische Aktionen
            </h2>
            <p className="mt-1 text-xs text-muted">
              Unverfälschte, serverseitig geladene Verwaltungsereignisse.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setLoading(true);
            setError(null);
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
        {loading ? (
          <AdminLoading label="Audit Log wird geladen" />
        ) : error ? (
          <AdminError message={error} />
        ) : !rows.length ? (
          <AdminEmpty
            title="Keine Audit-Einträge"
            description="Die Admin-API hat aktuell keine protokollierten Verwaltungsereignisse zurückgegeben."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                  <th className="px-4 py-3">Zeitpunkt</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Aktion</th>
                  <th className="px-4 py-3">Entität</th>
                  <th className="px-4 py-3">Referenz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-4 text-muted">
                      {displayDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-navy">
                      {row.actor ?? "Nicht verfügbar"}
                    </td>
                    <td className="px-4 py-4 text-ink">{row.action ?? "–"}</td>
                    <td className="px-4 py-4 text-muted">
                      {row.entity ?? "–"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted">
                      {row.entityId ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="border-t border-line bg-ivory px-5 py-4 text-xs leading-5 text-muted">
        Potentiell sensible Metadaten oder Tokenwerte werden in dieser Übersicht
        bewusst nicht ausgegeben.
      </p>
    </section>
  );
}
