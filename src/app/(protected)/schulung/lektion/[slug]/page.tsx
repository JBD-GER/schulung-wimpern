import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  LockKeyhole,
} from "lucide-react";
import { CourseNavigation } from "@/components/course/course-navigation";
import { LessonQuiz } from "@/components/course/lesson-quiz";
import { SecureVideoPlayer } from "@/components/course/secure-video-player";
import {
  AdminPreviewNotice,
  DataNotice,
  LessonStatus,
} from "@/components/dashboard/ui";
import { loadLesson } from "@/components/dashboard/data";
import { LESSONS } from "@/data/course";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const lesson = LESSONS.find((item) => item.slug === slug);
  return {
    title: lesson ? `Lektion ${lesson.position}: ${lesson.title}` : "Lektion",
    robots: { index: false, follow: false },
  };
}

export default async function LessonPage({ params }: PageProps) {
  const { slug } = await params;
  const staticLesson = LESSONS.find((item) => item.slug === slug);
  if (!staticLesson) notFound();

  const data = await loadLesson(slug);
  const lesson = data.lesson;
  const displayLesson = lesson ?? staticLesson;
  const lessonCount = data.lessons.length || LESSONS.length;

  return (
    <div className="mx-auto max-w-[1280px]">
      {data.adminPreview ? (
        <div className="mb-6">
          <AdminPreviewNotice />
        </div>
      ) : null}
      {data.loadFailed ? (
        <div className="mb-6">
          <DataNotice>
            Die Lektionsdaten konnten gerade nicht sicher geladen werden. Video
            und Wissenstest bleiben geschützt. Bitte versuche es später erneut.
          </DataNotice>
        </div>
      ) : null}
      {!data.available && !data.loadFailed ? (
        <div className="mb-6">
          <DataNotice>
            Für dieses Konto ist kein aktiver Schulungszugang hinterlegt. Die
            Lektion kann deshalb nicht geöffnet werden.
          </DataNotice>
        </div>
      ) : null}

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_21rem] xl:gap-9">
        <div className="flex min-w-0 flex-col">
          <nav
            aria-label="Breadcrumb"
            className="order-1 mb-5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted"
          >
            <Link
              href="/schulung"
              className="rounded hover:text-navy hover:underline"
            >
              Schulung
            </Link>
            <ChevronRight aria-hidden="true" className="size-3.5" />
            <span aria-current="page">Lektion {displayLesson.position}</span>
          </nav>

          <header className="order-3 mt-7 lg:order-2 lg:mt-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-extrabold tracking-[0.15em] text-gold uppercase">
                Lektion {displayLesson.position} von {lessonCount}
              </p>
              <LessonStatus status={lesson?.status ?? "locked"} />
            </div>
            {displayLesson.area ? (
              <p className="mt-4 text-xs font-bold tracking-[0.11em] text-muted uppercase">
                {displayLesson.area}
              </p>
            ) : null}
            <h1 className="mt-3 max-w-4xl font-serif text-3xl leading-[1.14] font-semibold tracking-[-0.03em] text-navy sm:text-4xl">
              {displayLesson.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-muted">
              <span className="inline-flex items-center gap-2">
                <Clock3 aria-hidden="true" className="size-4 text-gold" />
                {displayLesson.duration}
              </span>
              <span className="inline-flex items-center gap-2">
                <BookOpenCheck
                  aria-hidden="true"
                  className="size-4 text-gold"
                />
                Video + Wissenstest
              </span>
            </div>
          </header>

          <div className="order-2 lg:order-3 lg:mt-7">
            {data.unlocked && lesson?.id ? (
              <SecureVideoPlayer
                key={lesson.id}
                lessonId={lesson.id}
                lessonTitle={displayLesson.title}
                initialWatchedPercent={data.watchedPercent}
                previewMode={data.adminPreview}
              />
            ) : data.available && lesson && lesson.status === "locked" ? (
              <section
                className="grid aspect-video place-items-center rounded-2xl border border-line bg-white p-6 text-center shadow-card"
                aria-labelledby="lesson-locked-heading"
              >
                <div className="max-w-md">
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-navy/5 text-navy">
                    <LockKeyhole aria-hidden="true" className="size-5" />
                  </span>
                  <h2
                    id="lesson-locked-heading"
                    className="mt-4 font-serif text-2xl font-semibold text-navy"
                  >
                    Diese Lektion ist noch gesperrt
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Bestehe zuerst den Wissenstest der vorherigen Lektion mit
                    mindestens vier von fünf richtigen Antworten.
                  </p>
                  <Link
                    href="/schulung"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy hover:underline"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Zur verfügbaren Lektion
                  </Link>
                </div>
              </section>
            ) : (
              <section
                className="grid aspect-video place-items-center rounded-2xl border border-line bg-white p-6 text-center shadow-card"
                aria-labelledby="video-unavailable-heading"
              >
                <div className="max-w-md">
                  <LockKeyhole
                    aria-hidden="true"
                    className="mx-auto size-8 text-muted"
                  />
                  <h2
                    id="video-unavailable-heading"
                    className="mt-4 font-serif text-2xl font-semibold text-navy"
                  >
                    Videozugriff nicht verfügbar
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Die Berechtigung und Videokonfiguration konnten aktuell
                    nicht vollständig bestätigt werden.
                  </p>
                </div>
              </section>
            )}
          </div>

          <div className="order-4 mt-7 lg:hidden">
            <CourseNavigation lessons={data.lessons} currentSlug={slug} />
          </div>

          <div className="order-5 mt-8 space-y-8">
            {lesson?.legacyCompleted && !lesson.quizPassed ? (
              <DataNotice>
                Der Abschluss dieser Lektion wurde aus dem Bestand übernommen.
                Ein bestandener Wissenstest ist dafür nicht hinterlegt. Wenn du
                den Test neu ablegen möchtest, sieh dir zunächst mindestens
                90&nbsp;% des Videos an.
              </DataNotice>
            ) : null}
            <section
              className="rounded-2xl border border-line bg-white p-6 sm:p-7"
              aria-labelledby="lesson-content-heading"
            >
              <h2
                id="lesson-content-heading"
                className="font-serif text-2xl font-semibold text-navy"
              >
                In dieser Lektion
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {displayLesson.summary}
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {displayLesson.topics.map((topic) => (
                  <li
                    key={topic}
                    className="flex items-start gap-3 rounded-xl bg-ivory p-3.5 text-sm font-semibold text-navy"
                  >
                    <BookOpenCheck
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-gold"
                    />
                    {topic}
                  </li>
                ))}
              </ul>
            </section>

            <section
              className="rounded-2xl border border-line bg-white p-6 sm:p-7"
              aria-labelledby="materials-heading"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
                  <FileText aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h2
                    id="materials-heading"
                    className="font-serif text-xl font-semibold text-navy"
                  >
                    Ergänzende Materialien
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Zur Vertiefung dieser Lektion
                  </p>
                </div>
              </div>
              {data.materials.length ? (
                <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
                  {data.materials.map((material) => (
                    <li key={`${material.title}-${material.url}`}>
                      <a
                        href={material.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-14 items-center justify-between gap-4 px-4 text-sm font-bold text-navy hover:bg-ivory"
                      >
                        {material.title}
                        <Download
                          aria-hidden="true"
                          className="size-4 shrink-0 text-gold"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 rounded-xl bg-ivory p-4 text-sm leading-6 text-muted">
                  Für diese Lektion sind aktuell keine zusätzlichen Dateien
                  hinterlegt.
                </p>
              )}
            </section>

            {data.unlocked && lesson?.id && !data.adminPreview ? (
              <LessonQuiz
                lessonId={lesson.id}
                lessonPosition={displayLesson.position}
                initiallyAvailable={data.quizAvailable}
                published={data.quizPublished}
                alreadyPassed={lesson.quizPassed}
              />
            ) : null}
          </div>
        </div>

        <div className="hidden lg:block">
          <CourseNavigation lessons={data.lessons} currentSlug={slug} />
        </div>
      </div>
    </div>
  );
}
