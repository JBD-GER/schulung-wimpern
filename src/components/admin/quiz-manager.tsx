"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  HelpCircle,
  History,
  LoaderCircle,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button } from "@/components/ui/button";

type AdminOption = { id: string; text: string; isCorrect: boolean };
type AdminQuestion = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonPosition: number;
  position: number;
  questionText: string;
  editorialNote: string;
  status: "draft" | "approved";
  approvedAt: string | null;
  version: number | null;
  options: AdminOption[];
};

type QuizVersion = {
  id: string;
  version: number;
  questionText: string;
  editorialNote: string;
  status: "draft" | "approved";
  createdAt: string | null;
  options: AdminOption[];
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function displayDate(value: string | null) {
  if (!value) return "nicht verfügbar";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "nicht verfügbar"
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

function parseQuestion(value: unknown): AdminQuestion | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = text(item.id);
  const rawOptions = Array.isArray(item.options) ? item.options : [];
  if (!id || rawOptions.length !== 4) return null;
  const options = rawOptions.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const option = value as Record<string, unknown>;
    const optionId = text(option.id);
    if (!optionId) return [];
    return [
      {
        id: optionId,
        text: text(option.text ?? option.optionText ?? option.option_text),
        isCorrect: option.isCorrect === true || option.is_correct === true,
      },
    ];
  });
  if (options.length !== 4) return null;
  const rawStatus = text(item.status);
  return {
    id,
    lessonId: text(item.lessonId ?? item.lesson_id),
    lessonTitle: text(item.lessonTitle ?? item.lesson_title),
    lessonPosition: number(item.lessonPosition ?? item.lesson_position),
    position: number(item.position),
    questionText: text(item.questionText ?? item.question_text),
    editorialNote: text(item.editorialNote ?? item.editorial_note),
    status: rawStatus === "approved" ? "approved" : "draft",
    approvedAt: text(item.approvedAt ?? item.approved_at) || null,
    version: typeof item.version === "number" ? item.version : null,
    options,
  };
}

function parseQuestions(value: unknown): AdminQuestion[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).questions;
  if (!Array.isArray(raw)) return null;
  return raw
    .map(parseQuestion)
    .filter((item): item is AdminQuestion => item !== null)
    .sort(
      (a, b) => a.lessonPosition - b.lessonPosition || a.position - b.position,
    );
}

function parseHistory(value: unknown): QuizVersion[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).versions;
  if (!Array.isArray(raw)) return null;
  return raw
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const id = text(item.id);
      const version = number(item.version);
      if (!id || !version) return [];
      const rawOptions = Array.isArray(item.options) ? item.options : [];
      const options = rawOptions.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const option = entry as Record<string, unknown>;
        return [
          {
            id: text(option.id) || `${id}-${index}`,
            text: text(option.text ?? option.optionText ?? option.option_text),
            isCorrect: option.isCorrect === true || option.is_correct === true,
          },
        ];
      });
      const status = text(item.status);
      return [
        {
          id,
          version,
          questionText: text(item.questionText ?? item.question_text),
          editorialNote: text(item.editorialNote ?? item.editorial_note),
          status:
            status === "approved" ? ("approved" as const) : ("draft" as const),
          createdAt: text(item.createdAt ?? item.created_at) || null,
          options,
        },
      ];
    })
    .sort((a, b) => b.version - a.version);
}

const fieldStyles =
  "mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-navy focus:outline-none";

export function QuizManager() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<QuizVersion[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/quiz", {
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
              : "Quizdaten konnten nicht geladen werden.",
          );
        const parsed = parseQuestions(body);
        if (!parsed) throw new Error("Die Quizdaten sind unvollständig.");
        setQuestions(parsed);
        if (parsed[0]) {
          setSelectedId(parsed[0].id);
          setDraft(structuredClone(parsed[0]));
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Quizdaten konnten nicht geladen werden.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const approvedCount = useMemo(
    () => questions.filter((question) => question.status === "approved").length,
    [questions],
  );

  function selectQuestion(questionId: string) {
    const selected =
      questions.find((question) => question.id === questionId) ?? null;
    setSelectedId(questionId);
    setDraft(selected ? structuredClone(selected) : null);
    setValidation(null);
    setResult(null);
    setConfirming(false);
    setHistoryOpen(false);
    setHistoryError(null);
    setHistory([]);
  }

  async function loadHistory(questionId: string) {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(
        `/api/admin/quiz/${encodeURIComponent(questionId)}/history`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body && typeof body.message === "string"
            ? body.message
            : "Der Versionsverlauf konnte nicht geladen werden.",
        );
      const parsed = parseHistory(body);
      if (!parsed) throw new Error("Der Versionsverlauf ist unvollständig.");
      setHistory(parsed);
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "Der Versionsverlauf konnte nicht geladen werden.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function checkAndConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.questionText.trim()) {
      setValidation("Der Fragetext darf nicht leer sein.");
      return;
    }
    if (
      draft.options.length !== 4 ||
      draft.options.some((option) => !option.text.trim())
    ) {
      setValidation(
        "Alle vier Antwortmöglichkeiten müssen vollständig ausgefüllt sein.",
      );
      return;
    }
    if (draft.options.filter((option) => option.isCorrect).length !== 1) {
      setValidation("Genau eine Antwort muss als richtig markiert sein.");
      return;
    }
    setValidation(null);
    setConfirming(true);
  }

  async function saveQuestion() {
    if (!draft) return;
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/quiz/${encodeURIComponent(draft.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: draft.questionText,
            editorialNote: draft.editorialNote || undefined,
            options: draft.options.map((option) => ({
              id: option.id,
              text: option.text,
              isCorrect: option.isCorrect,
            })),
            status: draft.status,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body && typeof body.message === "string"
            ? body.message
            : "Die Frage konnte nicht gespeichert werden.",
        );
      const savedVersion =
        body &&
        typeof body === "object" &&
        typeof (body as Record<string, unknown>).version === "number"
          ? (body as Record<string, number>).version
          : draft.version;
      const savedDraft = { ...draft, version: savedVersion };
      setDraft(savedDraft);
      setQuestions((current) =>
        current.map((question) =>
          question.id === draft.id ? structuredClone(savedDraft) : question,
        ),
      );
      setConfirming(false);
      setResult({
        ok: true,
        message:
          draft.status === "approved"
            ? "Die Frage wurde gespeichert und redaktionell freigegeben."
            : "Die Frage wurde als Entwurf gespeichert.",
      });
      if (historyOpen) await loadHistory(draft.id);
    } catch (saveError) {
      setResult({
        ok: false,
        message:
          saveError instanceof Error
            ? saveError.message
            : "Die Frage konnte nicht gespeichert werden.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-card">
        <AdminLoading label="Quizfragen werden geladen" />
      </div>
    );
  if (error)
    return (
      <div className="mt-8">
        <AdminError message={error} />
      </div>
    );
  if (!questions.length)
    return (
      <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-card">
        <AdminEmpty
          title="Keine Quizfragen verfügbar"
          description="Die Admin-API hat keine bearbeitbaren Fragen zurückgegeben."
        />
      </div>
    );

  return (
    <div className="mt-8 grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside
        className="rounded-2xl border border-line bg-white p-4 shadow-card xl:self-start"
        aria-labelledby="quiz-list-title"
      >
        <div className="border-b border-line px-1 pb-4">
          <h2
            id="quiz-list-title"
            className="font-serif text-xl font-semibold text-navy"
          >
            {questions.length} Fragen
          </h2>
          <p className="mt-1 text-xs text-muted">
            {approvedCount} von {questions.length} freigegeben
          </p>
          {questions.length !== 35 ? (
            <p className="mt-2 text-xs leading-5 text-danger">
              Erwartet werden genau 35 Fragen: fünf je Lektion.
            </p>
          ) : null}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-beige">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${(approvedCount / questions.length) * 100}%` }}
            />
          </div>
        </div>
        <label className="mt-4 block text-xs font-bold text-navy">
          Frage auswählen
          <select
            className={fieldStyles}
            value={selectedId ?? ""}
            onChange={(event) => selectQuestion(event.target.value)}
          >
            {questions.map((question) => (
              <option key={question.id} value={question.id}>
                L{question.lessonPosition || "?"} · Frage{" "}
                {question.position || "?"} ·{" "}
                {question.status === "approved" ? "Freigegeben" : "Entwurf"}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {questions.map((question) => (
            <button
              key={question.id}
              type="button"
              onClick={() => selectQuestion(question.id)}
              className={`flex w-full items-start gap-3 rounded-xl p-3 text-left text-xs transition-colors ${selectedId === question.id ? "bg-[#f3ede5] text-navy" : "text-muted hover:bg-ivory"}`}
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${question.status === "approved" ? "bg-success/10 text-success" : "bg-navy/5 text-muted"}`}
              >
                {question.status === "approved" ? (
                  <CheckCircle2 aria-hidden="true" className="size-3" />
                ) : (
                  question.position
                )}
              </span>
              <span className="line-clamp-2 leading-5">
                <strong className="block text-navy">
                  Lektion {question.lessonPosition}
                </strong>
                {question.questionText || "Fragetext nicht verfügbar"}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {draft ? (
        <form
          onSubmit={checkAndConfirm}
          className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-7"
        >
          <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
                <HelpCircle aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-extrabold tracking-[0.1em] text-gold uppercase">
                  Lektion {draft.lessonPosition} · Frage {draft.position}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-navy">
                  Frage bearbeiten
                </h2>
              </div>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${draft.status === "approved" ? "bg-success/10 text-success" : "bg-navy/5 text-muted"}`}
            >
              {draft.status === "approved" ? "Freigegeben" : "Entwurf"}
            </span>
          </div>
          <div className="mt-6 space-y-5">
            <label className="block text-sm font-bold text-navy">
              Fragetext
              <textarea
                rows={3}
                className={`${fieldStyles} resize-y py-3`}
                value={draft.questionText}
                onChange={(event) =>
                  setDraft({ ...draft, questionText: event.target.value })
                }
              />
            </label>
            <fieldset>
              <legend className="text-sm font-bold text-navy">
                Vier Antwortmöglichkeiten
              </legend>
              <p className="mt-1 text-xs leading-5 text-muted">
                Markiere exakt eine Antwort als richtig. Diese Information
                bleibt ausschließlich im Adminbereich und auf dem Server.
              </p>
              <div className="mt-4 space-y-3">
                {draft.options.map((option, index) => (
                  <div
                    key={option.id}
                    className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[auto_1fr] sm:items-center"
                  >
                    <label className="flex items-center gap-2 text-xs font-bold text-navy">
                      <input
                        type="radio"
                        name="correctOption"
                        checked={option.isCorrect}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            options: draft.options.map((item, itemIndex) => ({
                              ...item,
                              isCorrect: itemIndex === index,
                            })),
                          })
                        }
                        className="size-4 accent-[#1d2733]"
                      />
                      Richtig
                    </label>
                    <label
                      className="sr-only"
                      htmlFor={`admin-option-${option.id}`}
                    >
                      Antwort {index + 1}
                    </label>
                    <input
                      id={`admin-option-${option.id}`}
                      className="min-h-11 w-full rounded-xl border border-line px-3 text-sm focus:border-navy focus:outline-none"
                      value={option.text}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          options: draft.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, text: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-bold text-navy">
              Redaktioneller Hinweis{" "}
              <span className="font-medium text-muted">(optional)</span>
              <textarea
                rows={3}
                className={`${fieldStyles} resize-y py-3`}
                value={draft.editorialNote}
                onChange={(event) =>
                  setDraft({ ...draft, editorialNote: event.target.value })
                }
              />
            </label>
            <label className="block text-sm font-bold text-navy">
              Freigabestatus
              <select
                className={fieldStyles}
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status:
                      event.target.value === "approved" ? "approved" : "draft",
                  })
                }
              >
                <option value="draft">Entwurf</option>
                <option value="approved">Freigegeben</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-ivory p-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <History aria-hidden="true" className="size-3.5" />
                Aktuelle Version: {draft.version ?? "nicht verfügbar"}
              </span>
              <span>Freigabedatum: {displayDate(draft.approvedAt)}</span>
            </div>
            <section
              className="rounded-2xl border border-line p-4 sm:p-5"
              aria-labelledby="quiz-history-title"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3
                    id="quiz-history-title"
                    className="flex items-center gap-2 text-sm font-bold text-navy"
                  >
                    <History aria-hidden="true" className="size-4 text-gold" />
                    Versionshistorie
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Frühere Inhalte und Antwortschlüssel dieser Frage
                    nachvollziehen.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-expanded={historyOpen}
                  aria-controls="quiz-history-content"
                  disabled={historyLoading}
                  onClick={() => {
                    if (historyOpen) setHistoryOpen(false);
                    else void loadHistory(draft.id);
                  }}
                >
                  {historyLoading ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <History aria-hidden="true" className="size-4" />
                  )}
                  {historyLoading
                    ? "Wird geladen …"
                    : historyOpen
                      ? "Verlauf schließen"
                      : "Verlauf laden"}
                </Button>
              </div>
              {historyOpen ? (
                <div
                  id="quiz-history-content"
                  className="mt-4 border-t border-line pt-4"
                >
                  {historyError ? (
                    <p
                      className="flex items-start gap-2 text-sm text-danger"
                      role="alert"
                    >
                      <AlertCircle
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      {historyError}
                    </p>
                  ) : null}
                  {!historyLoading && !historyError && !history.length ? (
                    <p className="text-sm text-muted">
                      Für diese Frage existiert noch keine frühere Version.
                    </p>
                  ) : null}
                  {history.length ? (
                    <ol className="space-y-3">
                      {history.map((version) => (
                        <li key={version.id}>
                          <details className="group rounded-xl bg-ivory p-4">
                            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-bold text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                              <span>
                                Version {version.version} ·{" "}
                                {version.status === "approved"
                                  ? "Freigegeben"
                                  : "Entwurf"}
                              </span>
                              <span className="text-xs font-medium text-muted">
                                {displayDate(version.createdAt)}
                              </span>
                            </summary>
                            <div className="mt-4 border-t border-line pt-4 text-sm leading-6 text-ink">
                              <p className="font-bold text-navy">
                                {version.questionText ||
                                  "Kein Fragetext gespeichert"}
                              </p>
                              {version.options.length ? (
                                <ol className="mt-3 space-y-2">
                                  {version.options.map((option, index) => (
                                    <li
                                      key={option.id}
                                      className={`rounded-lg border px-3 py-2 ${option.isCorrect ? "border-success/30 bg-success/5" : "border-line bg-white"}`}
                                    >
                                      <span className="mr-2 font-bold text-navy">
                                        {String.fromCharCode(65 + index)}.
                                      </span>
                                      {option.text || "Leere Antwort"}
                                      {option.isCorrect ? (
                                        <span className="ml-2 text-xs font-bold text-success">
                                          Richtig
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="mt-3 text-xs text-muted">
                                  Für diese Version ist kein Antwort-Snapshot
                                  verfügbar.
                                </p>
                              )}
                              {version.editorialNote ? (
                                <p className="mt-3 text-xs text-muted">
                                  <strong className="text-navy">
                                    Redaktioneller Hinweis:
                                  </strong>{" "}
                                  {version.editorialNote}
                                </p>
                              ) : null}
                            </div>
                          </details>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
            </section>
            <section
              className="rounded-2xl border border-line bg-[#fbf9f6] p-5 sm:p-6"
              aria-labelledby="quiz-preview-title"
            >
              <div className="flex items-start gap-3 border-b border-line pb-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-navy shadow-sm">
                  <Eye aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h3
                    id="quiz-preview-title"
                    className="text-sm font-bold text-navy"
                  >
                    Teilnehmerinnen-Vorschau
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Lektion {draft.lessonPosition}
                    {draft.lessonTitle ? ` · ${draft.lessonTitle}` : ""} · Frage{" "}
                    {draft.position}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-base font-bold leading-7 text-navy">
                {draft.questionText.trim() || "Fragetext noch nicht ausgefüllt"}
              </p>
              <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                {draft.options.map((option, index) => (
                  <li
                    key={option.id}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-navy/20 text-[0.65rem] font-bold text-navy">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option.text.trim() || "Antwort noch nicht ausgefüllt"}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs leading-5 text-muted">
                Die Vorschau zeigt bewusst keine Lösung und keine
                Sofortauswertung – wie im geschützten Wissenstest.
              </p>
            </section>
          </div>
          {validation ? (
            <p
              className="mt-5 flex items-start gap-2 text-sm text-danger"
              role="alert"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {validation}
            </p>
          ) : null}
          {result ? (
            <p
              className={`mt-5 flex items-start gap-2 text-sm ${result.ok ? "text-success" : "text-danger"}`}
              role={result.ok ? "status" : "alert"}
            >
              {result.ok ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              ) : (
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              )}
              {result.message}
            </p>
          ) : null}
          <div className="mt-6 border-t border-line pt-5">
            <Button type="submit">
              <Save aria-hidden="true" className="size-4" />
              Änderungen prüfen
            </Button>
          </div>

          <Dialog.Root
            open={confirming}
            onOpenChange={(open) => {
              if (!saving) setConfirming(open);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
              <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
                <ShieldCheck aria-hidden="true" className="size-7 text-gold" />
                <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
                  {draft.status === "approved"
                    ? "Frage redaktionell freigeben?"
                    : "Frage als Entwurf speichern?"}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                  Bei einer Freigabe wird die Frage für das zugehörige
                  Produktionsquiz verfügbar. Fragetext, vier Optionen und
                  richtiger Antwortschlüssel werden serverseitig validiert und
                  protokolliert.
                </Dialog.Description>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary" disabled={saving}>
                      Abbrechen
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="button"
                    onClick={() => void saveQuestion()}
                    disabled={saving}
                  >
                    {saving ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <ShieldCheck aria-hidden="true" className="size-4" />
                    )}
                    {saving ? "Wird gespeichert …" : "Verbindlich speichern"}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </form>
      ) : null}
    </div>
  );
}
