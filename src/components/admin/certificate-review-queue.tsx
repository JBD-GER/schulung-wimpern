"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Link2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button } from "@/components/ui/button";

type ReviewFilter = "pending" | "verified" | "rejected" | "resolved" | "all";
type ReviewStatus = Exclude<ReviewFilter, "all">;
type ReportedStatus = "pending" | "valid" | "revoked";

type ReviewRow = {
  id: string;
  userId: string;
  participantName: string | null;
  email: string | null;
  course: {
    id: string;
    title: string;
    version: string;
  } | null;
  paymentSource: string;
  sourceId: string;
  reportedStatus: ReportedStatus;
  reportedCourseVersion: string | null;
  reviewStatus: ReviewStatus;
  evidenceSummary: string | null;
  evidenceReference: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  mappedCertificate: {
    id: string;
    number: string;
    status: string;
    issuedAt: string | null;
  } | null;
};

type PendingAction =
  | {
      type: "review";
      decision: "verified" | "rejected";
      row: ReviewRow;
    }
  | { type: "map"; row: ReviewRow }
  | { type: "reissue"; row: ReviewRow };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const filterOptions: Array<{ value: ReviewFilter; label: string }> = [
  { value: "pending", label: "Prüfung offen" },
  { value: "verified", label: "Nachweis bestätigt" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "resolved", label: "Erledigt" },
  { value: "all", label: "Alle Status" },
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isReviewStatus(value: string | null): value is ReviewStatus {
  return (
    value === "pending" ||
    value === "verified" ||
    value === "rejected" ||
    value === "resolved"
  );
}

function isReportedStatus(value: string | null): value is ReportedStatus {
  return value === "pending" || value === "valid" || value === "revoked";
}

function parseCourse(value: unknown): ReviewRow["course"] | undefined {
  if (value === null || value === undefined) return null;
  const item = record(value);
  const id = text(item?.id);
  const title = text(item?.title);
  const version = text(item?.version);
  if (!item || !id || !UUID_PATTERN.test(id) || !title || !version) {
    return undefined;
  }
  return { id, title, version };
}

function parseMappedCertificate(
  value: unknown,
): ReviewRow["mappedCertificate"] | undefined {
  if (value === null || value === undefined) return null;
  const item = record(value);
  const id = text(item?.id);
  const number = text(item?.number);
  const status = text(item?.status);
  const issuedAt = text(item?.issuedAt ?? item?.issued_at);
  if (!item || !id || !UUID_PATTERN.test(id) || !number || !status) {
    return undefined;
  }
  return { id, number, status, issuedAt };
}

function parseReview(value: unknown): ReviewRow | null {
  const item = record(value);
  if (!item) return null;
  const id = text(item.id);
  const userId = text(item.userId ?? item.user_id);
  const paymentSource = text(item.paymentSource ?? item.payment_source);
  const sourceId = text(item.sourceId ?? item.source_id);
  const reportedStatus = text(item.reportedStatus ?? item.reported_status);
  const reviewStatus = text(item.reviewStatus ?? item.review_status);
  const createdAt = text(item.createdAt ?? item.created_at);
  const course = parseCourse(item.course);
  const mappedCertificate = parseMappedCertificate(
    item.mappedCertificate ?? item.mapped_certificate,
  );

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !userId ||
    !UUID_PATTERN.test(userId) ||
    !paymentSource ||
    !sourceId ||
    !isReportedStatus(reportedStatus) ||
    !isReviewStatus(reviewStatus) ||
    !createdAt ||
    course === undefined ||
    mappedCertificate === undefined
  ) {
    return null;
  }

  return {
    id,
    userId,
    participantName: text(item.participantName ?? item.participant_name),
    email: text(item.email),
    course,
    paymentSource,
    sourceId,
    reportedStatus,
    reportedCourseVersion: text(
      item.reportedCourseVersion ?? item.reported_course_version,
    ),
    reviewStatus,
    evidenceSummary: text(item.evidenceSummary ?? item.evidence_summary),
    evidenceReference: text(item.evidenceReference ?? item.evidence_reference),
    reviewedAt: text(item.reviewedAt ?? item.reviewed_at),
    resolvedAt: text(item.resolvedAt ?? item.resolved_at),
    createdAt,
    mappedCertificate,
  };
}

function parseReviews(value: unknown): ReviewRow[] | null {
  const reviews = record(value)?.reviews;
  if (!Array.isArray(reviews)) return null;
  const parsed = reviews.map(parseReview);
  return parsed.some((row) => row === null) ? null : (parsed as ReviewRow[]);
}

function displayDate(value: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      }).format(date);
}

function reportedStatusLabel(status: ReportedStatus): string {
  if (status === "valid") return "Als gültig gemeldet";
  if (status === "revoked") return "Als widerrufen gemeldet";
  return "Als ausstehend gemeldet";
}

function reviewStatusLabel(status: ReviewStatus): string {
  if (status === "verified") return "Nachweis bestätigt";
  if (status === "rejected") return "Abgelehnt";
  if (status === "resolved") return "Erledigt";
  return "Prüfung offen";
}

function certificateStatusLabel(status: string): string {
  if (status === "valid") return "Gültig";
  if (status === "revoked") return "Widerrufen";
  if (status === "archived") return "Archiviert";
  if (status === "failed") return "Fehlgeschlagen";
  if (status === "generating" || status === "replacing") {
    return "Wird erstellt";
  }
  return status;
}

function reportedStatusClass(status: ReportedStatus): string {
  if (status === "valid") return "bg-success/10 text-success";
  if (status === "revoked") return "bg-danger/10 text-danger";
  return "bg-gold/15 text-[#795f35]";
}

function reviewStatusClass(status: ReviewStatus): string {
  if (status === "resolved") return "bg-success/10 text-success";
  if (status === "rejected") return "bg-danger/10 text-danger";
  if (status === "verified") return "bg-[#edf1f5] text-navy";
  return "bg-gold/15 text-[#795f35]";
}

function participantLabel(row: ReviewRow): string {
  return (
    row.participantName ?? row.email ?? `Nutzer ${row.userId.slice(0, 8)}…`
  );
}

function actionCopy(action: PendingAction | null) {
  if (!action) {
    return {
      title: "Aktion bestätigen",
      description: "",
      button: "Bestätigen",
    };
  }
  if (action.type === "review" && action.decision === "verified") {
    return {
      title: "Historischen Nachweis bestätigen?",
      description: `Du bestätigst, dass die Quelldaten für ${participantLabel(action.row)} den gemeldeten Zertifikatsstatus nachvollziehbar belegen. Dadurch wird noch kein gültiges Zertifikat ausgestellt.`,
      button: "Nachweis verbindlich bestätigen",
    };
  }
  if (action.type === "review") {
    return {
      title: "Historischen Nachweis ablehnen?",
      description: `Du dokumentierst, warum die Quelldaten für ${participantLabel(action.row)} den gemeldeten Zertifikatsstatus nicht ausreichend belegen.`,
      button: "Nachweis verbindlich ablehnen",
    };
  }
  if (action.type === "map") {
    return {
      title: "Bestehendes Zertifikat zuordnen?",
      description: `Die angegebene Zertifikats-ID muss zu ${participantLabel(action.row)}, zum Kurs und zum gemeldeten Status passen. Die Zuordnung schließt diesen Prüffall ab.`,
      button: "Zertifikat verbindlich zuordnen",
    };
  }
  return {
    title: "Zertifikat kontrolliert neu ausstellen?",
    description: `Auf Grundlage des bestätigten historischen Nachweises wird für ${participantLabel(action.row)} ein neues Zertifikat erzeugt. Es werden dabei keine Quizversuche oder Lerndaten erfunden.`,
    button: "Neuausstellung verbindlich starten",
  };
}

export function CertificateReviewQueue() {
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reportedCourseVersion, setReportedCourseVersion] = useState("");
  const [certificateId, setCertificateId] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const load = useCallback(
    async (
      requestedFilter: ReviewFilter,
      requestedQuery: string,
      signal?: AbortSignal,
    ) => {
      try {
        const parameters = new URLSearchParams({ status: requestedFilter });
        if (requestedQuery) parameters.set("q", requestedQuery);
        const response = await fetch(
          `/api/admin/certificate-reviews?${parameters.toString()}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          },
        );
        const body = await response.json().catch(() => null);
        const message = record(body)?.message;
        if (!response.ok) {
          throw new Error(
            typeof message === "string"
              ? message
              : "Historische Zertifikatsprüfungen konnten nicht geladen werden.",
          );
        }
        const parsed = parseReviews(body);
        if (!parsed) {
          throw new Error(
            "Die Daten der historischen Zertifikatsprüfungen sind unvollständig.",
          );
        }
        setRows(parsed);
        setError(null);
      } catch (loadError) {
        if (signal?.aborted) return;
        setRows([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Historische Zertifikatsprüfungen konnten nicht geladen werden.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void load(filter, activeQuery, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeQuery, filter, load, reload]);

  function requestReload() {
    setLoading(true);
    setError(null);
    setResult(null);
    setReload((value) => value + 1);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveQuery(query.trim().slice(0, 120));
    setReload((value) => value + 1);
  }

  function openAction(action: PendingAction) {
    setPendingAction(action);
    setEvidenceSummary(action.row.evidenceSummary ?? "");
    setEvidenceReference(action.row.evidenceReference ?? "");
    setReportedCourseVersion(action.row.reportedCourseVersion ?? "");
    setCertificateId("");
    setParticipantName(
      action.type === "reissue" ? (action.row.participantName ?? "") : "",
    );
    setDialogError(null);
  }

  function closeAction() {
    if (saving) return;
    setPendingAction(null);
    setDialogError(null);
  }

  async function runAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAction) return;

    let payload: Record<string, string>;
    if (pendingAction.type === "review") {
      const summary = evidenceSummary.trim();
      const reference = evidenceReference.trim();
      if (pendingAction.row.reviewStatus !== "pending") {
        setDialogError("Nur offene Prüffälle können hier bewertet werden.");
        return;
      }
      if (summary.length < 10 || summary.length > 4000) {
        setDialogError(
          "Die Begründung muss zwischen 10 und 4.000 Zeichen lang sein.",
        );
        return;
      }
      if (reference && (reference.length < 3 || reference.length > 1000)) {
        setDialogError(
          "Die optionale Quellenreferenz muss zwischen 3 und 1.000 Zeichen lang sein.",
        );
        return;
      }
      const courseVersion = reportedCourseVersion.trim();
      if (
        pendingAction.decision === "verified" &&
        !/^[0-9]{4}\.[0-9]+$/.test(courseVersion)
      ) {
        setDialogError(
          "Bitte trage die in den Quelldaten belegte Kursversion im Format JJJJ.N ein.",
        );
        return;
      }
      payload = {
        action: "review",
        decision: pendingAction.decision,
        evidenceSummary: summary,
        ...(courseVersion ? { reportedCourseVersion: courseVersion } : {}),
        ...(reference ? { evidenceReference: reference } : {}),
      };
    } else if (pendingAction.type === "map") {
      const targetCertificateId = certificateId.trim();
      if (
        pendingAction.row.reviewStatus !== "verified" ||
        pendingAction.row.reportedStatus === "pending"
      ) {
        setDialogError(
          "Nur ein bestätigter Nachweis mit eindeutigem Zertifikatsstatus kann zugeordnet werden.",
        );
        return;
      }
      if (!UUID_PATTERN.test(targetCertificateId)) {
        setDialogError(
          "Bitte gib eine vollständige gültige Zertifikats-ID ein.",
        );
        return;
      }
      payload = { action: "map", certificateId: targetCertificateId };
    } else {
      const name = participantName.trim();
      if (
        pendingAction.row.reviewStatus !== "verified" ||
        pendingAction.row.reportedStatus !== "valid"
      ) {
        setDialogError(
          "Eine kontrollierte Neuausstellung ist nur für einen bestätigten, als gültig gemeldeten Nachweis möglich.",
        );
        return;
      }
      if (name && (name.length < 2 || name.length > 160)) {
        setDialogError(
          "Der optionale Zertifikatsname muss zwischen 2 und 160 Zeichen lang sein.",
        );
        return;
      }
      payload = {
        action: "reissue",
        ...(name ? { participantName: name } : {}),
      };
    }

    setSaving(true);
    setDialogError(null);
    setResult(null);
    try {
      const completedAction = pendingAction;
      const response = await fetch(
        `/api/admin/certificate-reviews/${encodeURIComponent(pendingAction.row.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => null);
      const responseRecord = record(body);
      if (!response.ok) {
        throw new Error(
          text(responseRecord?.message) ??
            "Die historische Zertifikatsprüfung konnte nicht gespeichert werden.",
        );
      }
      if (responseRecord?.ok !== true) {
        throw new Error(
          "Die Admin-API hat die abgeschlossene Aktion nicht bestätigt.",
        );
      }

      setPendingAction(null);
      setResult({
        ok: true,
        message:
          completedAction.type === "review"
            ? completedAction.decision === "verified"
              ? "Der historische Nachweis wurde bestätigt und im Audit Log protokolliert."
              : "Der historische Nachweis wurde abgelehnt und im Audit Log protokolliert."
            : completedAction.type === "map"
              ? "Das bestehende Zertifikat wurde zugeordnet und im Audit Log protokolliert."
              : "Das Zertifikat wurde kontrolliert neu ausgestellt und im Audit Log protokolliert.",
      });
      setLoading(true);
      setReload((value) => value + 1);
    } catch (actionError) {
      setDialogError(
        actionError instanceof Error
          ? actionError.message
          : "Die historische Zertifikatsprüfung konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  const copy = actionCopy(pendingAction);

  return (
    <>
      <section
        className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        aria-labelledby="legacy-certificate-review-title"
      >
        <div className="border-b border-line p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy/5 text-navy">
              <FileCheck2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                id="legacy-certificate-review-title"
                className="font-serif text-xl font-semibold text-navy"
              >
                Historische Zertifikatsnachweise
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Prüfe übernommene Statusangaben gegen die dokumentierten
                Quelldaten, bevor du sie zuordnest oder neu ausstellst.
              </p>
            </div>
          </div>

          <div
            className="mt-5 flex items-start gap-3 rounded-xl border border-gold/25 bg-gold/[.08] p-4 text-sm leading-6 text-navy"
            role="note"
          >
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-[#795f35]"
            />
            <p>
              <strong>
                Ein Importstatus ist noch kein gültiges Zertifikat.
              </strong>{" "}
              Diese Prüfung erzeugt keine Quizversuche und verändert keine
              Lerndaten. Jede Entscheidung wird serverseitig im Audit Log
              protokolliert.
            </p>
          </div>

          <form
            onSubmit={search}
            role="search"
            className="mt-5 grid gap-2 lg:grid-cols-[14rem_1fr_auto_auto]"
          >
            <label htmlFor="legacy-certificate-filter" className="sr-only">
              Prüfstatus filtern
            </label>
            <select
              id="legacy-certificate-filter"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as ReviewFilter);
                setLoading(true);
                setError(null);
                setResult(null);
              }}
              disabled={loading}
              className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-navy focus:border-navy focus:outline-none disabled:opacity-60"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <label htmlFor="legacy-certificate-search" className="sr-only">
                Historische Zertifikatsnachweise durchsuchen
              </label>
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
              />
              <input
                id="legacy-certificate-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={120}
                placeholder="Name, E-Mail, Quelle oder Zertifikatsnummer"
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
              onClick={requestReload}
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
              aria-live="polite"
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
            <AdminLoading label="Historische Zertifikatsprüfungen werden geladen" />
          ) : error ? (
            <AdminError message={error} />
          ) : !rows.length ? (
            <AdminEmpty
              title="Keine Prüffälle in dieser Ansicht"
              description="Für den gewählten Status und die aktuelle Suche wurden keine historischen Zertifikatsnachweise zurückgegeben."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[96rem] text-left text-sm">
                <thead>
                  <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                    <th className="px-4 py-3">Quelle</th>
                    <th className="px-4 py-3">Teilnehmerin</th>
                    <th className="px-4 py-3">Gemeldeter Status</th>
                    <th className="px-4 py-3">Prüfung</th>
                    <th className="px-4 py-3">Nachweis</th>
                    <th className="px-4 py-3">Zugeordnetes Zertifikat</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-4">
                        <span className="block font-semibold text-navy">
                          {row.paymentSource}
                        </span>
                        <span className="mt-1 block max-w-48 break-all font-mono text-xs text-muted">
                          {row.sourceId}
                        </span>
                        <span className="mt-2 block text-[0.68rem] text-muted">
                          Importiert {displayDate(row.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="block font-semibold text-navy">
                          {participantLabel(row)}
                        </span>
                        {row.participantName && row.email ? (
                          <span className="mt-1 block text-xs text-muted">
                            {row.email}
                          </span>
                        ) : null}
                        <span className="mt-2 block max-w-56 text-xs leading-5 text-muted">
                          {row.course
                            ? `${row.course.title} · Version ${row.course.version}`
                            : "Kursdaten nicht verfügbar"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${reportedStatusClass(row.reportedStatus)}`}
                        >
                          {reportedStatusLabel(row.reportedStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${reviewStatusClass(row.reviewStatus)}`}
                        >
                          {reviewStatusLabel(row.reviewStatus)}
                        </span>
                        {row.reviewedAt ? (
                          <span className="mt-2 block text-[0.68rem] text-muted">
                            Geprüft {displayDate(row.reviewedAt)}
                          </span>
                        ) : null}
                        {row.resolvedAt ? (
                          <span className="mt-1 block text-[0.68rem] text-muted">
                            Erledigt {displayDate(row.resolvedAt)}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-72 px-4 py-4">
                        {row.evidenceSummary ? (
                          <p className="line-clamp-4 text-xs leading-5 text-ink">
                            {row.evidenceSummary}
                          </p>
                        ) : (
                          <span className="text-xs text-muted">
                            Noch nicht dokumentiert
                          </span>
                        )}
                        {row.evidenceReference ? (
                          <span className="mt-2 flex items-start gap-1.5 break-all text-[0.68rem] leading-5 text-muted">
                            <Link2
                              aria-hidden="true"
                              className="mt-0.5 size-3 shrink-0"
                            />
                            {row.evidenceReference}
                          </span>
                        ) : null}
                        {row.reportedCourseVersion ? (
                          <span className="mt-2 block text-[0.68rem] font-semibold text-navy">
                            Belegte Kursversion {row.reportedCourseVersion}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        {row.mappedCertificate ? (
                          <>
                            <span className="block font-mono text-xs font-bold text-navy">
                              {row.mappedCertificate.number}
                            </span>
                            <span className="mt-1 block text-xs text-muted">
                              {certificateStatusLabel(
                                row.mappedCertificate.status,
                              )}
                            </span>
                            <span className="mt-1 block text-[0.68rem] text-muted">
                              {displayDate(row.mappedCertificate.issuedAt)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted">
                            Nicht zugeordnet
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {row.reviewStatus === "pending" ? (
                          <div className="flex min-w-52 flex-col items-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                openAction({
                                  type: "review",
                                  decision: "verified",
                                  row,
                                })
                              }
                            >
                              <BadgeCheck
                                aria-hidden="true"
                                className="size-4"
                              />
                              Nachweis bestätigen
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                openAction({
                                  type: "review",
                                  decision: "rejected",
                                  row,
                                })
                              }
                            >
                              <X aria-hidden="true" className="size-4" />
                              Nachweis ablehnen
                            </Button>
                          </div>
                        ) : row.reviewStatus === "verified" ? (
                          <div className="flex min-w-52 flex-col items-end gap-2">
                            {row.reportedStatus !== "pending" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openAction({ type: "map", row })}
                              >
                                <ClipboardCheck
                                  aria-hidden="true"
                                  className="size-4"
                                />
                                Zertifikat zuordnen
                              </Button>
                            ) : null}
                            {row.reportedStatus === "valid" ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  openAction({ type: "reissue", row })
                                }
                              >
                                <RotateCcw
                                  aria-hidden="true"
                                  className="size-4"
                                />
                                Neu ausstellen
                              </Button>
                            ) : null}
                            {row.reportedStatus === "pending" ? (
                              <span className="text-right text-xs leading-5 font-semibold text-muted">
                                Kein eindeutiger Zertifikatsstatus gemeldet
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="block min-w-40 text-right text-xs font-semibold text-muted">
                            Kein Bearbeitungsschritt offen
                          </span>
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
          Es werden höchstens 250 Prüffälle pro Ansicht geladen. Prüfe bei einer
          Zuordnung Teilnehmerin, Kurs und Zertifikatsstatus besonders
          sorgfältig; alle Entscheidungen und Zuordnungen werden
          audit-protokolliert.
        </p>
      </section>

      <Dialog.Root
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-muted hover:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-navy disabled:opacity-50"
                aria-label="Dialog schließen"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
            <span className="grid size-11 place-items-center rounded-xl bg-navy/5 text-navy">
              <FileCheck2 aria-hidden="true" className="size-5" />
            </span>
            <Dialog.Title className="mt-4 pr-10 font-serif text-2xl font-semibold text-navy">
              {copy.title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              {copy.description} Die Aktion wird mit deinem Administratorkonto
              im Audit Log protokolliert.
            </Dialog.Description>

            <form onSubmit={runAction} className="mt-6">
              {pendingAction?.type === "review" ? (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="legacy-review-course-version"
                      className="text-sm font-bold text-navy"
                    >
                      Belegte Kursversion{" "}
                      {pendingAction.decision === "rejected" ? (
                        <span className="font-normal">(optional)</span>
                      ) : null}
                    </label>
                    <input
                      id="legacy-review-course-version"
                      value={reportedCourseVersion}
                      onChange={(event) =>
                        setReportedCourseVersion(event.target.value)
                      }
                      required={pendingAction.decision === "verified"}
                      pattern="[0-9]{4}\.[0-9]+"
                      placeholder="z. B. 2026.1"
                      autoComplete="off"
                      aria-describedby="legacy-review-course-version-help"
                      className="mt-2 min-h-11 w-full rounded-xl border border-line px-3 font-mono text-sm focus:border-navy focus:outline-none"
                    />
                    <p
                      id="legacy-review-course-version-help"
                      className="mt-1.5 text-xs leading-5 text-muted"
                    >
                      Nur aus dem belegten Quelldatensatz übernehmen, nicht aus
                      der aktuell veröffentlichten Version ableiten
                      {pendingAction.row.course
                        ? ` (aktuell: ${pendingAction.row.course.version}).`
                        : "."}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="legacy-review-summary"
                      className="text-sm font-bold text-navy"
                    >
                      Prüfbegründung
                    </label>
                    <textarea
                      id="legacy-review-summary"
                      value={evidenceSummary}
                      onChange={(event) =>
                        setEvidenceSummary(event.target.value)
                      }
                      required
                      minLength={10}
                      maxLength={4000}
                      rows={5}
                      aria-describedby="legacy-review-summary-help"
                      className="mt-2 w-full rounded-xl border border-line p-3 text-sm leading-6 focus:border-navy focus:outline-none"
                    />
                    <p
                      id="legacy-review-summary-help"
                      className="mt-1.5 flex justify-between gap-3 text-xs text-muted"
                    >
                      <span>Mindestens 10 Zeichen, konkret und prüfbar.</span>
                      <span>{evidenceSummary.length}/4.000</span>
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="legacy-review-reference"
                      className="text-sm font-bold text-navy"
                    >
                      Quellenreferenz{" "}
                      <span className="font-normal">(optional)</span>
                    </label>
                    <input
                      id="legacy-review-reference"
                      value={evidenceReference}
                      onChange={(event) =>
                        setEvidenceReference(event.target.value)
                      }
                      minLength={evidenceReference ? 3 : undefined}
                      maxLength={1000}
                      placeholder="z. B. Exportdatei, Datensatz oder Ticket"
                      className="mt-2 min-h-11 w-full rounded-xl border border-line px-3 text-sm focus:border-navy focus:outline-none"
                    />
                  </div>
                </div>
              ) : null}

              {pendingAction?.type === "map" ? (
                <div>
                  <label
                    htmlFor="legacy-certificate-id"
                    className="text-sm font-bold text-navy"
                  >
                    Interne Zertifikats-ID
                  </label>
                  <input
                    id="legacy-certificate-id"
                    value={certificateId}
                    onChange={(event) => setCertificateId(event.target.value)}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    className="mt-2 min-h-11 w-full rounded-xl border border-line px-3 font-mono text-sm focus:border-navy focus:outline-none"
                  />
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Verwende ausschließlich die interne ID eines bereits
                    vorhandenen Zertifikats derselben Teilnehmerin und desselben
                    Kurses. Du kannst sie in der Tabelle „Ausgestellte
                    Zertifikate“ unterhalb dieser Warteschlange markieren und
                    kopieren. Der Server prüft zusätzlich Teilnehmerin, Kurs und
                    gemeldeten Status.
                  </p>
                </div>
              ) : null}

              {pendingAction?.type === "reissue" ? (
                <div>
                  <label
                    htmlFor="legacy-certificate-name"
                    className="text-sm font-bold text-navy"
                  >
                    Name auf dem Zertifikat{" "}
                    <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="legacy-certificate-name"
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                    maxLength={160}
                    autoComplete="off"
                    placeholder="Gespeicherten Zertifikatsnamen verwenden"
                    className="mt-2 min-h-11 w-full rounded-xl border border-line px-3 text-sm focus:border-navy focus:outline-none"
                  />
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Leer lassen, um den gespeicherten Zertifikatsnamen zu
                    verwenden. Die kontrollierte Neuausstellung stützt sich auf
                    den menschlich bestätigten historischen Nachweis, nicht auf
                    erfundene Quizdaten.
                  </p>
                </div>
              ) : null}

              {dialogError ? (
                <p
                  className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[.045] p-3 text-sm leading-6 text-danger"
                  role="alert"
                >
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0"
                  />
                  {dialogError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary" disabled={saving}>
                    Abbrechen
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  variant={
                    pendingAction?.type === "review" &&
                    pendingAction.decision === "rejected"
                      ? "danger"
                      : "primary"
                  }
                  disabled={saving}
                >
                  {saving ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : pendingAction?.type === "map" ? (
                    <ClipboardCheck aria-hidden="true" className="size-4" />
                  ) : pendingAction?.type === "reissue" ? (
                    <RotateCcw aria-hidden="true" className="size-4" />
                  ) : (
                    <BadgeCheck aria-hidden="true" className="size-4" />
                  )}
                  {saving ? "Wird gespeichert …" : copy.button}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
