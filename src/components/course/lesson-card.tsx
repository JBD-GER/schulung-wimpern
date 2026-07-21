"use client";

import Link from "next/link";
import { ArrowRight, Clock3, ListChecks } from "lucide-react";
import { useId, useState } from "react";
import { LessonStatus, ProgressBar } from "@/components/dashboard/ui";
import type { LessonSummary } from "@/components/dashboard/data";
import { cn } from "@/lib/utils";

const SUMMARY_PREVIEW_CHARACTERS = 140;

function ExpandableSummary({
  summary,
  lessonTitle,
}: {
  summary: string;
  lessonTitle: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const expandable = summary.length > SUMMARY_PREVIEW_CHARACTERS;
  const visibleSummary =
    expandable && !expanded
      ? `${summary.slice(0, SUMMARY_PREVIEW_CHARACTERS)}…`
      : summary;

  return (
    <div className="mt-3">
      <p id={contentId} className="text-sm leading-6 text-muted">
        {visibleSummary}
      </p>
      {expandable ? (
        <button
          type="button"
          className="pointer-events-auto mt-2 inline-flex min-h-7 items-center rounded-full border border-gold/30 bg-ivory px-2.5 py-1 text-[0.68rem] font-extrabold text-navy transition-colors hover:border-gold/60 hover:bg-beige/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={`${expanded ? "Weniger anzeigen" : "Mehr lesen"}: ${lessonTitle}`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Weniger anzeigen" : "Mehr lesen"}
        </button>
      ) : null}
    </div>
  );
}

export function LessonCard({ lesson }: { lesson: LessonSummary }) {
  const unlocked = lesson.status !== "locked";
  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_9px_30px_rgba(29,39,51,.055)] transition",
        unlocked
          ? "border-line hover:-translate-y-0.5 hover:border-gold/55 hover:shadow-card"
          : "border-line/80 opacity-75",
      )}
      aria-label={unlocked ? undefined : `${lesson.title} – gesperrt`}
    >
      {unlocked ? (
        <Link
          href={`/schulung/lektion/${lesson.slug}`}
          className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-gold"
          aria-label={`${lesson.title} öffnen`}
        />
      ) : null}
      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-ivory font-serif text-base font-bold text-navy">
            {String(lesson.position).padStart(2, "0")}
          </span>
          <LessonStatus status={lesson.status} />
        </div>
        {lesson.area ? (
          <p className="mt-5 text-[0.65rem] font-extrabold tracking-[0.14em] text-gold uppercase">
            {lesson.area}
          </p>
        ) : null}
        <h2
          className={cn(
            "font-serif text-xl leading-snug font-semibold text-navy",
            lesson.area ? "mt-2" : "mt-5",
          )}
        >
          {lesson.title}
        </h2>
        <ExpandableSummary
          summary={lesson.summary}
          lessonTitle={lesson.title}
        />
        <div className="mt-auto pt-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden="true" className="size-3.5 text-gold" />
              {lesson.duration}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks aria-hidden="true" className="size-3.5 text-gold" />
              Video + Wissenstest
            </span>
            {unlocked ? (
              <ArrowRight
                aria-hidden="true"
                className="ml-auto size-4 text-navy"
              />
            ) : null}
          </div>
          {lesson.status === "in_progress" ? (
            <ProgressBar
              value={lesson.watchedPercent}
              label="Videofortschritt"
              className="mt-4"
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
