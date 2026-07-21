import Link from "next/link";
import { ArrowLeft, ChevronDown, Clock3 } from "lucide-react";
import { LessonStatus, ProgressBar } from "@/components/dashboard/ui";
import type { LessonSummary } from "@/components/dashboard/data";
import { cn } from "@/lib/utils";

function NavigationList({
  lessons,
  currentSlug,
}: {
  lessons: LessonSummary[];
  currentSlug: string;
}) {
  return (
    <ol className="space-y-1.5">
      {lessons.map((lesson) => {
        const current = lesson.slug === currentSlug;
        const unlocked = lesson.status !== "locked";
        const row = (
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 transition-colors",
              current
                ? "border-gold/45 bg-[#f4eee6]"
                : unlocked
                  ? "border-transparent hover:border-line hover:bg-ivory"
                  : "border-transparent opacity-65",
            )}
          >
            <LessonStatus status={lesson.status} compact />
            <div className="min-w-0 flex-1">
              <p className="text-[0.66rem] font-extrabold tracking-[0.09em] text-muted uppercase">
                Lektion {lesson.position}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs leading-5 font-bold",
                  current ? "text-navy" : "text-ink",
                )}
              >
                {lesson.title}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[0.65rem] font-semibold text-muted">
                <Clock3 aria-hidden="true" className="size-3" />{" "}
                {lesson.duration}
              </span>
            </div>
          </div>
        );

        return (
          <li key={lesson.slug}>
            {unlocked ? (
              <Link
                href={`/schulung/lektion/${lesson.slug}`}
                aria-current={current ? "page" : undefined}
                className="block rounded-xl"
              >
                {row}
              </Link>
            ) : (
              <div aria-label={`${lesson.title} – gesperrt`}>{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function CourseNavigation({
  lessons,
  currentSlug,
}: {
  lessons: LessonSummary[];
  currentSlug: string;
}) {
  const completedCount = lessons.filter(
    (lesson) => lesson.status === "completed",
  ).length;
  const progress = Math.round(
    (completedCount / Math.max(1, lessons.length)) * 100,
  );

  return (
    <aside
      className="lg:sticky lg:top-8 lg:self-start"
      aria-label="Kursnavigation"
    >
      <details className="group rounded-2xl border border-line bg-white shadow-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-bold text-navy marker:hidden">
          <span>Alle Lektionen & Fortschritt</span>
          <ChevronDown
            aria-hidden="true"
            className="size-5 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-line p-4">
          <ProgressBar
            value={progress}
            label={`${completedCount} von 7 abgeschlossen`}
          />
          <div className="mt-5">
            <NavigationList lessons={lessons} currentSlug={currentSlug} />
          </div>
          <Link
            href="/schulung"
            className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-navy text-sm font-bold text-navy hover:bg-ivory"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Zurück zum Kurs
          </Link>
        </div>
      </details>

      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card lg:block">
        <div className="border-b border-line bg-[#f3ede5] p-5">
          <p className="text-xs font-extrabold tracking-[0.13em] text-[#795f35] uppercase">
            Kursfortschritt
          </p>
          <ProgressBar
            value={progress}
            label={`${completedCount} von 7 abgeschlossen`}
            className="mt-4"
          />
        </div>
        <div className="max-h-[calc(100dvh-19rem)] overflow-y-auto p-3">
          <NavigationList lessons={lessons} currentSlug={currentSlug} />
        </div>
        <div className="border-t border-line p-4">
          <Link
            href="/schulung"
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-navy text-sm font-bold text-navy transition-colors hover:bg-ivory"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Zurück zum Kurs
          </Link>
        </div>
      </div>
    </aside>
  );
}
