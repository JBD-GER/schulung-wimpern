"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Download,
  LoaderCircle,
  Mail,
  RefreshCw,
  Search,
  ShieldOff,
  X,
} from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button, buttonStyles } from "@/components/ui/button";

type CertificateRow = {
  id: string;
  number: string | null;
  participant: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  status: string | null;
  courseVersion: string | null;
  deliveryId: string | null;
  deliveryStatus: string | null;
};

type PendingAction = {
  type: "revoke" | "retry_email";
  row: CertificateRow;
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
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

function parseCertificates(
  value: unknown,
): Omit<CertificateRow, "deliveryId" | "deliveryStatus">[] | null {
  const rows = record(value)?.certificates;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((row) => {
    const item = record(row);
    const id = text(item?.id);
    if (!item || !id) return [];
    return [
      {
        id,
        number: text(
          item.number ?? item.certificateNumber ?? item.certificate_number,
        ),
        participant: text(
          item.participant ?? item.participantName ?? item.participant_name,
        ),
        issuedAt: text(item.issuedAt ?? item.issued_at),
        revokedAt: text(item.revokedAt ?? item.revoked_at),
        status: text(item.status),
        courseVersion: text(item.courseVersion ?? item.course_version),
      },
    ];
  });
}

function parseCertificateDeliveries(value: unknown) {
  const rows = record(value)?.deliveries;
  if (!Array.isArray(rows)) return null;
  const result = new Map<string, { id: string; status: string | null }>();
  for (const row of rows) {
    const item = record(row);
    const id = text(item?.id);
    const eventKey = text(item?.eventKey ?? item?.event_key);
    if (!id || !eventKey?.startsWith("certificate-ready:")) continue;
    result.set(eventKey.slice("certificate-ready:".length), {
      id,
      status: text(item?.status),
    });
  }
  return result;
}

function actionCopy(action: PendingAction | null) {
  if (!action)
    return {
      title: "Aktion bestätigen",
      description: "",
      button: "Bestätigen",
    };
  if (action.type === "revoke")
    return {
      title: "Zertifikat wirklich widerrufen?",
      description: `Das Zertifikat ${action.row.number ?? "ohne Nummer"} wird sofort als widerrufen markiert. Seine öffentliche Prüfung zeigt danach nicht mehr „gültig“ an.`,
      button: "Verbindlich widerrufen",
    };
  return {
    title: "Zertifikats-E-Mail erneut senden?",
    description: `Der fehlgeschlagene Versand für ${action.row.number ?? "dieses Zertifikat"} wird erneut angestoßen und im Audit Log protokolliert.`,
    button: "E-Mail erneut senden",
  };
}

export function CertificateManager() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [mutating, setMutating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const load = useCallback(async (search: string, signal?: AbortSignal) => {
    try {
      const [certificateResponse, emailResponse] = await Promise.all([
        fetch(
          `/api/admin/certificates?q=${encodeURIComponent(search.trim())}`,
          { credentials: "same-origin", cache: "no-store", signal },
        ),
        fetch("/api/admin/emails", {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        }),
      ]);
      const [certificateBody, emailBody] = await Promise.all([
        certificateResponse.json().catch(() => null),
        emailResponse.json().catch(() => null),
      ]);
      if (!certificateResponse.ok) {
        const message = record(certificateBody)?.message;
        throw new Error(
          typeof message === "string"
            ? message
            : "Zertifikate konnten nicht geladen werden.",
        );
      }
      const certificates = parseCertificates(certificateBody);
      if (!certificates)
        throw new Error("Die Zertifikatsdaten sind unvollständig.");
      const deliveries = emailResponse.ok
        ? parseCertificateDeliveries(emailBody)
        : null;
      const deliveryLookupAvailable = emailResponse.ok && deliveries !== null;
      setRows(
        certificates.map((certificate) => {
          const delivery = deliveries?.get(certificate.id);
          return {
            ...certificate,
            deliveryId: delivery?.id ?? null,
            deliveryStatus:
              delivery?.status ??
              (deliveryLookupAvailable
                ? "nicht protokolliert"
                : "nicht verfügbar"),
          };
        }),
      );
      setError(null);
    } catch (loadError) {
      if (signal?.aborted) return;
      setRows([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Zertifikate konnten nicht geladen werden.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void load(activeQuery, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeQuery, load, reload]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveQuery(query.trim());
    setReload((value) => value + 1);
  }

  function openAction(type: PendingAction["type"], row: CertificateRow) {
    setPendingAction({ type, row });
  }

  async function runAction() {
    if (!pendingAction) return;
    setMutating(true);
    setResult(null);
    try {
      const isEmailRetry = pendingAction.type === "retry_email";
      if (isEmailRetry && !pendingAction.row.deliveryId)
        throw new Error(
          "Für dieses Zertifikat ist kein wiederholbarer Versanddatensatz vorhanden.",
        );
      const response = await fetch(
        isEmailRetry
          ? `/api/admin/emails/${encodeURIComponent(pendingAction.row.deliveryId!)}/retry`
          : `/api/admin/certificates/${encodeURIComponent(pendingAction.row.id)}`,
        {
          method: isEmailRetry ? "POST" : "PATCH",
          credentials: "same-origin",
          headers: isEmailRetry
            ? undefined
            : { "Content-Type": "application/json" },
          body: isEmailRetry
            ? undefined
            : JSON.stringify({ action: pendingAction.type }),
        },
      );
      const body = await response.json().catch(() => null);
      const message = record(body)?.message;
      if (!response.ok)
        throw new Error(
          typeof message === "string"
            ? message
            : "Die Admin-Aktion konnte nicht abgeschlossen werden.",
        );
      const completedAction = pendingAction.type;
      setPendingAction(null);
      setResult({
        ok: true,
        message:
          completedAction === "revoke"
            ? "Das Zertifikat wurde widerrufen und protokolliert."
            : "Die Zertifikats-E-Mail wurde erneut versendet und protokolliert.",
      });
      setLoading(true);
      setReload((value) => value + 1);
    } catch (actionError) {
      setPendingAction(null);
      setResult({
        ok: false,
        message:
          actionError instanceof Error
            ? actionError.message
            : "Die Admin-Aktion konnte nicht abgeschlossen werden.",
      });
    } finally {
      setMutating(false);
    }
  }

  const copy = actionCopy(pendingAction);

  return (
    <>
      <section
        className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        aria-labelledby="cert-admin-title"
      >
        <div className="border-b border-line p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
              <Award aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                id="cert-admin-title"
                className="font-serif text-xl font-semibold text-navy"
              >
                Ausgestellte Zertifikate
              </h2>
              <p className="mt-1 text-xs text-muted">
                Suche anhand einer bestätigten Zertifikatsnummer.
              </p>
            </div>
          </div>
          <form
            onSubmit={search}
            role="search"
            className="mt-5 flex flex-col gap-2 sm:flex-row"
          >
            <label htmlFor="certificate-admin-search" className="sr-only">
              Zertifikat suchen
            </label>
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
              />
              <input
                id="certificate-admin-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zertifikatsnummer"
                className="min-h-11 w-full rounded-xl border border-line pr-3 pl-10 text-sm focus:border-navy focus:outline-none"
              />
            </div>
            <Button type="submit" size="sm" disabled={loading}>
              Suchen
            </Button>
            <Button
              type="button"
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
          </form>
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
            <AdminLoading label="Zertifikate werden geladen" />
          ) : error ? (
            <AdminError message={error} />
          ) : !rows.length ? (
            <AdminEmpty
              title="Keine Zertifikate gefunden"
              description="Für die aktuelle Suche wurden keine bestätigten Zertifikatsdatensätze zurückgegeben."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[76rem] text-left text-sm">
                <thead>
                  <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                    <th className="px-4 py-3">Nummer</th>
                    <th className="px-4 py-3">Teilnehmerin</th>
                    <th className="px-4 py-3">Ausgestellt</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Gültigkeit</th>
                    <th className="px-4 py-3">Versand</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-4">
                        <span className="block font-mono text-xs font-bold text-navy">
                          {row.number ?? "–"}
                        </span>
                        <span
                          className="mt-1 block max-w-56 cursor-text break-all font-mono text-[0.64rem] leading-4 font-normal text-muted select-all"
                          title="Interne Zertifikats-ID – markieren und kopieren"
                        >
                          ID: {row.id}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-navy">
                        {row.participant ?? "Nicht verfügbar"}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        <span className="block">
                          {displayDate(row.issuedAt)}
                        </span>
                        {row.revokedAt ? (
                          <span className="mt-1 block text-[0.68rem] text-danger">
                            Widerrufen {displayDate(row.revokedAt)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {row.courseVersion ?? "–"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "valid" ? "bg-success/10 text-success" : row.status === "revoked" || row.status === "failed" ? "bg-danger/10 text-danger" : "bg-navy/5 text-muted"}`}
                        >
                          {row.status ?? "–"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs font-bold text-muted">
                          {row.deliveryStatus ?? "Kein Versanddatensatz"}
                        </span>
                        {row.deliveryId && row.deliveryStatus === "failed" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 px-0"
                            onClick={() => openAction("retry_email", row)}
                          >
                            <Mail aria-hidden="true" className="size-4" />
                            Erneut senden
                          </Button>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {row.status &&
                          ["valid", "revoked", "archived"].includes(
                            row.status,
                          ) ? (
                            <a
                              href={`/api/admin/certificates/${encodeURIComponent(row.id)}/download`}
                              className={buttonStyles({
                                variant: "secondary",
                                size: "sm",
                              })}
                            >
                              <Download aria-hidden="true" className="size-4" />
                              PDF
                            </a>
                          ) : null}
                          {row.status === "valid" ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openAction("revoke", row)}
                            >
                              <ShieldOff
                                aria-hidden="true"
                                className="size-4"
                              />
                              Widerrufen
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="border-t border-line bg-ivory px-5 py-4 text-xs leading-5 text-muted">
          Zertifikatsinhalte bleiben nach der Ausstellung unveränderlich.
          Widerruf und erneuter Versand erfordern eine Bestätigung und werden
          serverseitig im Audit Log protokolliert.
        </p>
      </section>

      <Dialog.Root
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !mutating) {
            setPendingAction(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={mutating}
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-muted hover:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                aria-label="Dialog schließen"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
            <span
              className={`grid size-11 place-items-center rounded-xl ${pendingAction?.type === "revoke" ? "bg-danger/10 text-danger" : "bg-navy/5 text-navy"}`}
            >
              {pendingAction?.type === "revoke" ? (
                <ShieldOff aria-hidden="true" className="size-5" />
              ) : pendingAction?.type === "retry_email" ? (
                <Mail aria-hidden="true" className="size-5" />
              ) : (
                <Award aria-hidden="true" className="size-5" />
              )}
            </span>
            <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
              {copy.title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              {copy.description}
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={mutating}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button
                variant={
                  pendingAction?.type === "revoke" ? "danger" : "primary"
                }
                onClick={() => void runAction()}
                disabled={mutating}
              >
                {mutating ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : pendingAction?.type === "revoke" ? (
                  <ShieldOff aria-hidden="true" className="size-4" />
                ) : pendingAction?.type === "retry_email" ? (
                  <Mail aria-hidden="true" className="size-4" />
                ) : (
                  <Award aria-hidden="true" className="size-4" />
                )}
                {mutating ? "Wird ausgeführt …" : copy.button}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
