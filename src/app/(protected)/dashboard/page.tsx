import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  Headphones,
  Play,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

function certificateStatusMessage(status: string | null) {
  switch (status) {
    case "legacy_pending":
      return "Dein übernommener Zertifikatsverweis wird im Adminbereich anhand der Quelldaten geprüft.";
    case "legacy_verified":
      return "Dein historischer Nachweis wurde bestätigt. Zuordnung oder kontrollierte Neuausstellung stehen noch aus.";
    case "legacy_rejected":
      return "Der historische Zertifikatsverweis konnte nicht bestätigt werden. Bitte wende dich bei Rückfragen an den Support.";
    case "legacy_resolved":
      return "Die Prüfung deines historischen Zertifikatsverweises ist abgeschlossen; die Bereitstellung wird aktualisiert.";
    case "failed":
      return "Die Zertifikatserstellung konnte nicht abgeschlossen werden. Im Zertifikatsbereich kannst du den Status erneut prüfen.";
    case "revoked":
      return "Das bisherige Zertifikat ist widerrufen und kann nicht heruntergeladen werden. Details findest du im Zertifikatsbereich.";
    case "archived":
      return "Für diesen Kurs besteht bereits ein archivierter Zertifikatsverlauf. Details und mögliche Korrekturen werden ausschließlich über den Support geklärt.";
    case "generating":
      return "Dein Zertifikat wird gerade sicher erstellt.";
    case "replacing":
      return "Die kontrollierte Neuausstellung deines Zertifikats wird gerade abgeschlossen.";
    case "valid":
      return "Das Zertifikat ist gültig; die PDF-Datei wird vor dem Download noch sicher geprüft.";
    default:
      return "Dein Abschluss ist gespeichert. Prüfe im Zertifikatsbereich deinen vollständigen Namen und bestätige die einmalige Ausstellung.";
  }
}
import { loadDashboard } from "@/components/dashboard/data";
import {
  AdminPreviewNotice,
  DataNotice,
  LessonStatus,
  PageIntro,
  ProgressBar,
} from "@/components/dashboard/ui";

export default async function DashboardPage() {
  const data = await loadDashboard();
  const started =
    data.completedCount > 0 ||
    data.lessons.some((lesson) => lesson.status === "in_progress");
  const firstNameSuffix = data.firstName ? `, ${data.firstName}` : "";

  if (!data.hasAccess) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageIntro
          eyebrow="Teilnehmerbereich"
          title={`Willkommen${firstNameSuffix}`}
          description={
            data.loadFailed
              ? "Dein Konto ist angemeldet. Die Zugangsprüfung ist aktuell technisch nicht verfügbar."
              : "Dein Konto ist angemeldet. Ein aktiver Schulungszugang konnte aktuell jedoch nicht bestätigt werden."
          }
        />
        <div className="mt-9 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          <DataNotice>
            {data.loadFailed
              ? "Es wird vorsichtshalber kein Zugriff angezeigt, bis deine Berechtigung wieder sicher geprüft werden kann. Bitte versuche es in einem Moment erneut."
              : "Wenn du gerade bezahlt hast, kann eine verzögerte Zahlungsart noch in Bearbeitung sein. Der Zugang wird erst nach bestätigtem Zahlungseingang freigeschaltet."}
          </DataNotice>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/kontakt"
              className={buttonStyles({ variant: "primary" })}
            >
              Support kontaktieren
            </Link>
            <Link href="/" className={buttonStyles({ variant: "secondary" })}>
              Zur Startseite
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageIntro
        eyebrow="Dein Lernbereich"
        title={`Willkommen zurück${firstNameSuffix}`}
        description="Hier siehst du deinen persönlichen Lernstand und kannst direkt dort weitermachen, wo du aufgehört hast."
      />

      {data.adminPreview ? (
        <div className="mt-8">
          <AdminPreviewNotice />
        </div>
      ) : null}

      {data.loadFailed ? (
        <DataNotice>
          Dein aktueller Lernstand konnte gerade nicht geladen werden. Bitte
          aktualisiere die Seite in einem Moment erneut.
        </DataNotice>
      ) : null}

      {data.courseCompleted ? (
        <section className="relative mt-9 overflow-hidden rounded-2xl bg-navy px-6 py-7 text-white shadow-[0_18px_45px_rgba(29,39,51,.2)] sm:px-8 sm:py-8">
          <div
            className="absolute -top-20 -right-16 size-56 rounded-full border border-gold/25"
            aria-hidden="true"
          />
          <div
            className="absolute -top-8 -right-3 size-32 rounded-full border border-gold/15"
            aria-hidden="true"
          />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full border border-gold/50 bg-white/5">
                <Award aria-hidden="true" className="size-6 text-[#dfc79f]" />
              </span>
              <div>
                <p className="text-xs font-bold tracking-[0.15em] text-[#dfc79f] uppercase">
                  Erfolgreich abgeschlossen
                </p>
                <h2 className="mt-2 font-serif text-2xl font-semibold">
                  Deine Schulung ist geschafft
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
                  {data.certificateReady
                    ? "Dein persönliches Zertifikat ist gültig und steht zum Download bereit."
                    : certificateStatusMessage(data.certificateStatus)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              {data.certificateReady ? (
                <a
                  href="/api/certificate/download"
                  className={buttonStyles({ variant: "gold" })}
                >
                  <Download aria-hidden="true" className="size-4" />
                  Zertifikat herunterladen
                </a>
              ) : null}
              <Link
                href="/zertifikat"
                className={buttonStyles({
                  variant: "secondary",
                  className:
                    "border-white/30 bg-white/10 text-white hover:bg-white/15",
                })}
              >
                {data.certificateReady
                  ? "Zertifikat ansehen"
                  : data.certificateStatus
                    ? "Zertifikatsstatus ansehen"
                    : "Zertifikatsdaten prüfen"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-9 grid gap-5 lg:grid-cols-[1.65fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          <div
            className="absolute top-0 left-0 h-1 w-28 bg-gold"
            aria-hidden="true"
          />
          <div className="flex items-start justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
                <GraduationCap aria-hidden="true" className="size-4" />
                Deine Schulung
              </span>
              <h2 className="mt-3 font-serif text-2xl font-semibold text-navy">
                {started
                  ? "Setze deine Schulung fort"
                  : "Deine Schulung ist freigeschaltet"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {started
                  ? "Dein Fortschritt wird nach jeder bestandenen Lektion aktualisiert."
                  : "Du kannst sofort mit der ersten Lektion beginnen."}
              </p>
            </div>
            <span className="hidden font-serif text-4xl font-semibold text-navy sm:block">
              {data.loadFailed ? "–" : `${data.progressPercent} %`}
            </span>
          </div>
          <ProgressBar
            value={data.progressPercent}
            label="Gesamtfortschritt"
            className="mt-7"
          />
          {data.lastLesson ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              Zuletzt bearbeitet: Lektion {data.lastLesson.position} ·{" "}
              {data.lastLesson.title}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-muted">
              <strong className="text-navy">
                {data.loadFailed ? "–" : data.completedCount}
              </strong>{" "}
              von 7 Lektionen abgeschlossen
            </span>
            <Link
              href={
                data.currentLesson
                  ? `/schulung/lektion/${data.currentLesson.slug}`
                  : "/schulung"
              }
              className={buttonStyles({ variant: "primary" })}
            >
              <Play aria-hidden="true" className="size-4 fill-current" />
              {started && data.currentLesson
                ? `Bei Lektion ${data.currentLesson.position} weitermachen`
                : "Schulung starten"}
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-[#f0e9e0] p-6 sm:p-7">
          <p className="text-xs font-extrabold tracking-[0.14em] text-[#795f35] uppercase">
            Nächster Schritt
          </p>
          {data.currentLesson ? (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-muted">
                  Lektion {data.currentLesson.position} von 7
                </span>
                <LessonStatus status={data.currentLesson.status} />
              </div>
              <h2 className="mt-3 font-serif text-xl leading-snug font-semibold text-navy">
                {data.currentLesson.title}
              </h2>
              <Link
                href={`/schulung/lektion/${data.currentLesson.slug}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-navy hover:underline"
              >
                Lektion öffnen{" "}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </>
          ) : data.courseCompleted ? (
            <>
              <CheckCircle2
                aria-hidden="true"
                className="mt-5 size-8 text-success"
              />
              <h2 className="mt-3 font-serif text-xl font-semibold text-navy">
                Alle Lektionen abgeschlossen
              </h2>
              <Link
                href="/zertifikat"
                className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-navy hover:underline"
              >
                Zum Zertifikat{" "}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </>
          ) : (
            <p className="mt-5 text-sm leading-6 text-muted">
              Sobald dein Lernstand verfügbar ist, erscheint hier deine nächste
              Lektion.
            </p>
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-5 md:grid-cols-3">
        <Link
          href="/schulung"
          className="group rounded-2xl border border-line bg-white p-5 transition hover:border-gold/50 hover:shadow-card"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
            <BookOpen aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 font-bold text-navy">Kursübersicht</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Alle sieben Lektionen und ihren Status ansehen.
          </p>
        </Link>
        <Link
          href="/profil?bereich=bestellungen"
          className="group rounded-2xl border border-line bg-white p-5 transition hover:border-gold/50 hover:shadow-card"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
            <FileText aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 font-bold text-navy">
            Bestellungen & Rechnungen
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Zahlungsdetails und verfügbare Rechnungen öffnen.
          </p>
        </Link>
        <Link
          href="/kontakt"
          className="group rounded-2xl border border-line bg-white p-5 transition hover:border-gold/50 hover:shadow-card"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
            <Headphones aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 font-bold text-navy">Support</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Du hast eine Frage? Wir helfen dir gerne weiter.
          </p>
        </Link>
      </section>
    </div>
  );
}
