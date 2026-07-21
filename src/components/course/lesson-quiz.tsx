"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QuizOption = { id: string; text: string };
type QuizQuestion = { id: string; text: string; options: QuizOption[] };
type QuizAttempt = { attemptId: string; questions: QuizQuestion[] };
type QuizResult = {
  score: number;
  total: number;
  passed: boolean;
  nextLessonSlug?: string;
  topicsToReview?: string[];
};

function parseAttempt(value: unknown): QuizAttempt | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.attemptId !== "string" ||
    !Array.isArray(record.questions) ||
    record.questions.length !== 5
  )
    return null;

  const questions: QuizQuestion[] = [];
  for (const item of record.questions) {
    if (!item || typeof item !== "object") return null;
    const question = item as Record<string, unknown>;
    if (
      typeof question.id !== "string" ||
      typeof question.text !== "string" ||
      !Array.isArray(question.options) ||
      question.options.length !== 4
    )
      return null;
    const options: QuizOption[] = [];
    for (const optionValue of question.options) {
      if (!optionValue || typeof optionValue !== "object") return null;
      const option = optionValue as Record<string, unknown>;
      if (typeof option.id !== "string" || typeof option.text !== "string")
        return null;
      options.push({ id: option.id, text: option.text });
    }
    questions.push({ id: question.id, text: question.text, options });
  }
  return { attemptId: record.attemptId, questions };
}

function parseResult(value: unknown): QuizResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.score !== "number" ||
    typeof record.total !== "number" ||
    typeof record.passed !== "boolean"
  )
    return null;
  return {
    score: record.score,
    total: record.total,
    passed: record.passed,
    nextLessonSlug:
      typeof record.nextLessonSlug === "string"
        ? record.nextLessonSlug
        : undefined,
    topicsToReview: Array.isArray(record.topicsToReview)
      ? record.topicsToReview.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
  };
}

export function LessonQuiz({
  lessonId,
  lessonPosition,
  initiallyAvailable,
  published,
  alreadyPassed,
}: {
  lessonId: string;
  lessonPosition: number;
  initiallyAvailable: boolean;
  published: boolean;
  alreadyPassed: boolean;
}) {
  const [available, setAvailable] = useState(initiallyAvailable);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const headingRef = useRef<HTMLLegendElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const startInFlightRef = useRef(false);
  const quizSectionId = `wissenstest-${lessonId}`;
  const startButtonId = `wissenstest-start-${lessonId}`;

  const startQuiz = useCallback(async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    setConfirming(false);
    try {
      const response = await fetch(
        `/api/quiz/${encodeURIComponent(lessonId)}/start`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId }),
        },
      );
      if (!response.ok)
        throw new Error("Der Wissenstest konnte nicht gestartet werden.");
      const parsed = parseAttempt(await response.json());
      if (!parsed)
        throw new Error(
          "Der Wissenstest ist noch nicht vollständig freigegeben.",
        );
      setAttempt(parsed);
      setAnswers({});
      setCurrent(0);
    } catch (quizError) {
      setError(
        quizError instanceof Error
          ? quizError.message
          : "Der Wissenstest konnte nicht geladen werden.",
      );
    } finally {
      startInFlightRef.current = false;
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    const handleUnlock = () => setAvailable(true);
    window.addEventListener(`quiz-unlocked:${lessonId}`, handleUnlock);
    return () =>
      window.removeEventListener(`quiz-unlocked:${lessonId}`, handleUnlock);
  }, [lessonId]);

  useEffect(() => {
    const handleNavigation = () => {
      setAvailable(true);
      document.getElementById(quizSectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      void startQuiz();
    };
    window.addEventListener(`quiz-navigate:${lessonId}`, handleNavigation);
    return () =>
      window.removeEventListener(`quiz-navigate:${lessonId}`, handleNavigation);
  }, [lessonId, quizSectionId, startQuiz]);

  useEffect(() => {
    if (attempt) headingRef.current?.focus();
  }, [attempt, current]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  async function submitQuiz() {
    if (!attempt || Object.keys(answers).length !== 5) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/quiz/${encodeURIComponent(lessonId)}/submit`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId: attempt.attemptId,
            answers: attempt.questions.map((question) => ({
              questionId: question.id,
              optionId: answers[question.id],
            })),
          }),
        },
      );
      if (!response.ok)
        throw new Error("Deine Antworten konnten nicht ausgewertet werden.");
      const parsed = parseResult(await response.json());
      if (!parsed || parsed.total !== 5 || parsed.score < 0 || parsed.score > 5)
        throw new Error("Die Auswertung war unvollständig.");
      setResult(parsed);
      setAttempt(null);
      setConfirming(false);
    } catch (quizError) {
      setError(
        quizError instanceof Error
          ? quizError.message
          : "Deine Antworten konnten nicht übermittelt werden.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyPassed && !result) {
    const finalLesson = lessonPosition === 7;
    return (
      <section
        id={quizSectionId}
        className="scroll-mt-24 rounded-2xl border border-success/20 bg-success/[.065] p-6 sm:p-8"
        aria-labelledby="quiz-complete-title"
      >
        {finalLesson ? (
          <Award aria-hidden="true" className="size-9 text-success" />
        ) : (
          <CheckCircle2 aria-hidden="true" className="size-9 text-success" />
        )}
        <h2
          id="quiz-complete-title"
          className="mt-4 font-serif text-2xl font-semibold text-navy"
        >
          {finalLesson
            ? "Schulung erfolgreich abgeschlossen"
            : "Wissenstest bestanden"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {finalLesson
            ? "Du hast alle sieben Lektionen abgeschlossen. Im Zertifikatsbereich bestätigst du vor der einmaligen Ausstellung den exakten Namen oder lädst dein bereits ausgestelltes Zertifikat herunter. Alle Kursinhalte bleiben weiterhin für dich verfügbar."
            : "Diese Lektion ist abgeschlossen. Du kannst das Video jederzeit erneut ansehen oder mit deiner Schulung fortfahren."}
        </p>
        <Link
          href={finalLesson ? "/zertifikat" : "/schulung"}
          className={buttonStyles({ variant: "primary", className: "mt-5" })}
        >
          {finalLesson ? "Zum Zertifikatsbereich" : "Zur Kursübersicht"}{" "}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>
    );
  }

  if (!published) {
    return (
      <section
        id={quizSectionId}
        className="scroll-mt-24 rounded-2xl border border-line bg-white p-6 sm:p-8"
        aria-labelledby="quiz-unpublished-title"
      >
        <ClipboardCheck aria-hidden="true" className="size-8 text-gold" />
        <h2
          id="quiz-unpublished-title"
          className="mt-4 font-serif text-2xl font-semibold text-navy"
        >
          Wissenstest in Vorbereitung
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Der Wissenstest ist redaktionell noch nicht vollständig freigegeben
          und wird deshalb nicht angezeigt.
        </p>
      </section>
    );
  }

  if (!available) {
    return (
      <section
        id={quizSectionId}
        className="scroll-mt-24 rounded-2xl border border-line bg-white p-6 sm:p-8"
        aria-labelledby="quiz-locked-title"
      >
        <span className="grid size-11 place-items-center rounded-full bg-navy/5 text-navy">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </span>
        <h2
          id="quiz-locked-title"
          className="mt-4 font-serif text-2xl font-semibold text-navy"
        >
          Wissenstest noch gesperrt
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Erreiche mindestens 90&nbsp;% der Videoposition. Du kannst im Video
          frei vor- und zurückspulen.
        </p>
      </section>
    );
  }

  if (result) {
    const completedCourse = result.passed && lessonPosition === 7;
    return (
      <section
        id={quizSectionId}
        className={cn(
          "scroll-mt-24 rounded-2xl border p-6 sm:p-8",
          result.passed
            ? "border-success/20 bg-success/[.065]"
            : "border-[#dbbf93] bg-[#fffaf2]",
        )}
        aria-live="polite"
      >
        {result.passed ? (
          <CheckCircle2 aria-hidden="true" className="size-10 text-success" />
        ) : (
          <AlertCircle aria-hidden="true" className="size-10 text-[#8a6737]" />
        )}
        <p className="mt-5 text-xs font-extrabold tracking-[0.15em] text-muted uppercase">
          Dein Ergebnis
        </p>
        <h2
          ref={resultRef}
          tabIndex={-1}
          className="mt-2 font-serif text-3xl font-semibold text-navy focus:outline-none"
        >
          {completedCourse
            ? "Schulung abgeschlossen"
            : result.passed
              ? "Bestanden"
              : "Noch nicht bestanden"}
        </h2>
        <p className="mt-3 text-lg font-bold text-navy">
          {result.score} von {result.total} Fragen richtig
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {completedCourse
            ? "Du hast alle sieben Lektionen und Wissenstests erfolgreich abgeschlossen. Dein Abschluss ist gespeichert. Prüfe jetzt den exakten Namen und bestätige die einmalige Zertifikatsausstellung."
            : result.passed
              ? "Die Lektion ist abgeschlossen und die nächste Lektion wurde freigeschaltet."
              : "Zum Bestehen brauchst du mindestens vier richtige Antworten. Du kannst den Test ohne zusätzliche Kosten wiederholen."}
        </p>
        {!result.passed && result.topicsToReview?.length ? (
          <div className="mt-5 rounded-xl border border-[#dbbf93]/60 bg-white/60 p-4">
            <h3 className="text-sm font-bold text-navy">
              Diese Themen solltest du noch einmal ansehen:
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {result.topicsToReview.map((topic) => (
                <li key={topic}>• {topic}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {result.passed ? (
            <Link
              href={
                completedCourse
                  ? "/zertifikat"
                  : result.nextLessonSlug
                    ? `/schulung/lektion/${result.nextLessonSlug}`
                    : "/schulung"
              }
              className={buttonStyles({ variant: "primary" })}
            >
              {completedCourse
                ? "Zertifikatsdaten prüfen"
                : result.nextLessonSlug
                  ? "Mit der nächsten Lektion fortfahren"
                  : "Zur Kursübersicht"}{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <>
              <a
                href="#kursvideo"
                className={buttonStyles({ variant: "secondary" })}
              >
                <Play aria-hidden="true" className="size-4" />
                Video noch einmal ansehen
              </a>
              <Button onClick={() => void startQuiz()} disabled={loading}>
                <RotateCcw aria-hidden="true" className="size-4" />
                Wissenstest wiederholen
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }

  if (!attempt) {
    return (
      <section
        id={quizSectionId}
        className="scroll-mt-24 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
        aria-labelledby="quiz-ready-title"
      >
        <ClipboardCheck aria-hidden="true" className="size-9 text-gold" />
        <h2
          id="quiz-ready-title"
          className="mt-4 font-serif text-2xl font-semibold text-navy"
        >
          Wissenstest zu Lektion {lessonPosition}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Fünf Fragen, jeweils vier Antwortmöglichkeiten. Die Auswertung erfolgt
          erst, nachdem du alle Antworten abgegeben hast. Zum Bestehen brauchst
          du mindestens vier richtige Antworten.
        </p>
        {error ? (
          <p
            className="mt-4 flex items-start gap-2 text-sm text-danger"
            role="alert"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {error}
          </p>
        ) : null}
        <Button
          id={startButtonId}
          className="mt-6"
          onClick={() => void startQuiz()}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ClipboardCheck aria-hidden="true" className="size-4" />
          )}
          {loading ? "Wissenstest wird geladen …" : "Wissenstest starten"}
        </Button>
      </section>
    );
  }

  const question = attempt.questions[current];
  const answeredCount = Object.keys(answers).length;
  const missing = attempt.questions.filter((item) => !answers[item.id]);

  return (
    <section
      id={quizSectionId}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
      aria-labelledby="current-question-heading"
    >
      <div className="border-b border-line bg-[#f3ede5] px-5 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-[#795f35] uppercase">
              Wissenstest · Lektion {lessonPosition}
            </p>
            <p className="mt-1 text-sm font-bold text-navy">
              Frage {current + 1} von 5
            </p>
          </div>
          <p className="text-xs font-semibold text-muted" aria-live="polite">
            {answeredCount} von 5 beantwortet
          </p>
        </div>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-white"
          role="progressbar"
          aria-label="Quizfortschritt"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={answeredCount}
        >
          <div
            className="h-full rounded-full bg-gold transition-[width]"
            style={{ width: `${answeredCount * 20}%` }}
          />
        </div>
      </div>

      <div className="p-5 sm:p-8">
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="Fragen auswählen"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const focused = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let target = focused;
            if (event.key === "ArrowRight") target = Math.min(4, focused + 1);
            else if (event.key === "ArrowLeft")
              target = Math.max(0, focused - 1);
            else if (event.key === "Home") target = 0;
            else if (event.key === "End") target = 4;
            else return;
            event.preventDefault();
            buttons[target]?.focus();
            setCurrent(target);
          }}
        >
          {attempt.questions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`quiz-question-tab-${index}`}
              aria-controls="quiz-question-panel"
              aria-selected={current === index}
              aria-label={`Frage ${index + 1}${answers[item.id] ? ", beantwortet" : ", noch offen"}`}
              tabIndex={current === index ? 0 : -1}
              onClick={() => setCurrent(index)}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full border text-sm font-extrabold transition-colors",
                current === index
                  ? "border-navy bg-navy text-white"
                  : answers[item.id]
                    ? "border-gold/60 bg-gold/10 text-navy"
                    : "border-line bg-white text-muted hover:border-navy/30",
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div
          id="quiz-question-panel"
          role="tabpanel"
          aria-labelledby={`quiz-question-tab-${current}`}
        >
          <fieldset className="mt-7">
            <legend
              ref={headingRef}
              id="current-question-heading"
              tabIndex={-1}
              className="max-w-3xl font-serif text-xl leading-snug font-semibold text-navy focus:outline-none sm:text-2xl"
            >
              {question.text}
            </legend>
            <div className="mt-6 space-y-3">
              {question.options.map((option, index) => {
                const selected = answers[question.id] === option.id;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors",
                      selected
                        ? "border-navy bg-navy/[.045]"
                        : "border-line hover:border-navy/30 hover:bg-ivory/70",
                    )}
                  >
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={option.id}
                      checked={selected}
                      onChange={() =>
                        setAnswers((currentAnswers) => ({
                          ...currentAnswers,
                          [question.id]: option.id,
                        }))
                      }
                      className="mt-1 size-4 shrink-0 accent-[#1d2733]"
                    />
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full border border-gold/35 bg-white text-xs font-extrabold text-[#795f35]"
                      aria-hidden="true"
                    >
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="pt-0.5 text-sm leading-6 text-ink">
                      {option.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="mt-7 flex flex-col-reverse justify-between gap-3 border-t border-line pt-5 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => setCurrent((index) => Math.max(0, index - 1))}
            disabled={current === 0}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Vorherige Frage
          </Button>
          {current < 4 ? (
            <Button
              onClick={() => setCurrent((index) => Math.min(4, index + 1))}
            >
              Nächste Frage <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              disabled={missing.length > 0}
            >
              Antworten prüfen{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>

        <div
          className="mt-5 rounded-xl bg-ivory p-4 text-sm"
          aria-live="polite"
        >
          {missing.length ? (
            <p className="text-muted">
              <strong className="text-navy">Noch offen:</strong>{" "}
              {missing
                .map((item) => attempt.questions.indexOf(item) + 1)
                .join(", ")}
              . Beantworte alle fünf Fragen, bevor du abgibst.
            </p>
          ) : (
            <p className="text-muted">
              <strong className="text-navy">Alle Fragen beantwortet.</strong> Du
              kannst deine Auswahl noch ändern oder die Antworten abgeben.
            </p>
          )}
        </div>

        {missing.length === 0 && current < 4 && !confirming ? (
          <Button className="mt-4" onClick={() => setConfirming(true)}>
            Antworten prüfen{" "}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        ) : null}

        {confirming && missing.length === 0 ? (
          <div
            className="mt-5 rounded-xl border border-gold/45 bg-[#fffaf2] p-5"
            role="region"
            aria-live="polite"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
          >
            <h3 id="confirm-title" className="font-bold text-navy">
              Antworten jetzt verbindlich abgeben?
            </h3>
            <p
              id="confirm-description"
              className="mt-2 text-sm leading-6 text-muted"
            >
              Erst nach der Abgabe werden deine fünf Antworten serverseitig
              ausgewertet.
            </p>
            {error ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                Noch einmal prüfen
              </Button>
              <Button
                size="sm"
                onClick={() => void submitQuiz()}
                disabled={submitting}
              >
                {submitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                )}
                {submitting ? "Wird ausgewertet …" : "Antworten abgeben"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
