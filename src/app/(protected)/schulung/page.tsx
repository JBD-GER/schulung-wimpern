import { Clock3, GraduationCap, Layers3 } from "lucide-react";
import { LessonCard } from "@/components/course/lesson-card";
import { loadCourse } from "@/components/dashboard/data";
import {
  AdminPreviewNotice,
  DataNotice,
  PageIntro,
  ProgressBar,
} from "@/components/dashboard/ui";

export default async function CoursePage() {
  const data = await loadCourse();

  return (
    <div className="mx-auto max-w-6xl">
      <PageIntro
        eyebrow="Online-Schulung"
        title={data.course.title}
        description={
          data.course.description ||
          "Arbeite die sieben Lektionen in deinem Tempo durch. Die jeweils nächste Lektion wird freigeschaltet, sobald du den Wissenstest der vorherigen bestanden hast."
        }
      />

      {data.adminPreview ? (
        <div className="mt-8">
          <AdminPreviewNotice />
        </div>
      ) : null}

      {!data.hasAccess && !data.loadFailed ? (
        <div className="mt-8">
          <DataNotice>
            Für dieses Konto ist aktuell kein aktiver Schulungszugang
            hinterlegt. Videos und Wissenstests bleiben deshalb geschützt.
          </DataNotice>
        </div>
      ) : null}
      {data.loadFailed ? (
        <div className="mt-8">
          <DataNotice>
            Der aktuelle Kursfortschritt konnte gerade nicht geladen werden.
            Bitte versuche es später erneut.
          </DataNotice>
        </div>
      ) : null}

      <section className="mt-9 rounded-2xl bg-navy p-6 text-white shadow-[0_16px_42px_rgba(29,39,51,.17)] sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap gap-5 text-sm text-white/70">
              <span className="inline-flex items-center gap-2">
                <Layers3 aria-hidden="true" className="size-4 text-[#dfc79f]" />
                {data.lessons.length || 7} Lektionen
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock3 aria-hidden="true" className="size-4 text-[#dfc79f]" />
                {data.course.learningScope}
              </span>
              <span className="inline-flex items-center gap-2">
                <GraduationCap
                  aria-hidden="true"
                  className="size-4 text-[#dfc79f]"
                />
                Niveau: {data.course.level}
              </span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/65">
              Dein Kursfortschritt richtet sich nach bestandenen Wissenstests.
              Für jede Lektion brauchst du mindestens vier von fünf richtigen
              Antworten.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.055] p-5">
            <ProgressBar
              value={data.progressPercent}
              label="Gesamtfortschritt"
            />
            <p className="mt-3 text-right text-xs font-semibold text-white/60">
              {data.loadFailed
                ? "Lernstand nicht verfügbar"
                : `${data.completedCount} von ${data.lessons.length || 7} Lektionen abgeschlossen`}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="lektionen-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
              Kursplan
            </p>
            <h2
              id="lektionen-heading"
              className="mt-2 font-serif text-2xl font-semibold text-navy"
            >
              Deine Lektionen
            </h2>
          </div>
          <p className="hidden text-sm text-muted sm:block">
            In vorgegebener Reihenfolge
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.lessons.map((lesson) => (
            <LessonCard key={lesson.slug} lesson={lesson} />
          ))}
        </div>
      </section>
    </div>
  );
}
