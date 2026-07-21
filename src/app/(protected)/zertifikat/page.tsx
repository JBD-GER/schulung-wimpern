import Link from "next/link";
import {
  AlertCircle,
  Award,
  Check,
  Download,
  ExternalLink,
  FileSearch,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { CertificatePreview } from "@/components/course/certificate-preview";
import { CertificateConfirmationDialog } from "@/components/certificate/certificate-confirmation-dialog";
import { CertificateRetryButton } from "@/components/certificate/certificate-retry-button";
import {
  loadCertificate,
  type CertificateData,
} from "@/components/dashboard/data";
import { DataNotice, PageIntro, ProgressBar } from "@/components/dashboard/ui";
import { buttonStyles } from "@/components/ui/button";

type Certificate = NonNullable<CertificateData["certificate"]>;

function statusPresentation(status: Certificate["status"]) {
  switch (status) {
    case "valid":
      return { label: "Gültig", className: "bg-success/10 text-success" };
    case "revoked":
      return { label: "Widerrufen", className: "bg-danger/10 text-danger" };
    case "archived":
      return { label: "Archiviert", className: "bg-navy/5 text-muted" };
    case "failed":
      return {
        label: "Erstellung fehlgeschlagen",
        className: "bg-danger/10 text-danger",
      };
    case "generating":
      return { label: "Wird erstellt", className: "bg-navy/5 text-muted" };
    case "replacing":
      return {
        label: "Wird neu ausgestellt",
        className: "bg-navy/5 text-muted",
      };
    default:
      return {
        label: "Status wird geprüft",
        className: "bg-navy/5 text-muted",
      };
  }
}

function CertificateNotice({
  certificate,
  downloadAvailable,
  retryAvailable,
}: {
  certificate: Certificate;
  downloadAvailable: boolean;
  retryAvailable: boolean;
}) {
  if (certificate.status === "revoked") {
    return (
      <div
        className="mt-8 rounded-xl border border-danger/25 bg-danger/[.055] p-5 text-sm leading-6 text-danger"
        role="alert"
      >
        Dieses Zertifikat ist als widerrufen markiert. Ein Download wird nicht
        angeboten. Bitte wende dich bei Fragen an den Support.
      </div>
    );
  }
  if (certificate.status === "archived") {
    return (
      <div className="mt-8">
        <DataNotice>
          Dieser Zertifikatsverlauf ist archiviert. Eine erneute automatische
          Ausstellung ist ausgeschlossen. Bitte wende dich für eine mögliche
          kontrollierte Korrektur an den Support.
        </DataNotice>
      </div>
    );
  }
  if (certificate.status === "failed") {
    return (
      <div
        className="mt-8 rounded-xl border border-danger/25 bg-danger/[.055] p-5 text-sm leading-6 text-danger"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertCircle aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <p>
            Die sichere Zertifikatserstellung konnte nicht abgeschlossen werden.
            Eine unvollständige Datei wird nicht zum Download angeboten.
          </p>
        </div>
        {retryAvailable ? (
          <CertificateRetryButton className="mt-4 pl-7" />
        ) : (
          <p className="mt-3 pl-7">
            Bitte wende dich zur kontrollierten Prüfung an den Support.
          </p>
        )}
      </div>
    );
  }
  if (
    certificate.status === "generating" ||
    certificate.status === "replacing"
  ) {
    return (
      <div className="mt-8">
        <DataNotice>
          {certificate.status === "generating"
            ? "Dein Zertifikat wird gerade serverseitig erstellt und sicher gespeichert. Bitte aktualisiere die Seite in einem Moment erneut."
            : "Die kontrollierte Neuausstellung wird gerade abgeschlossen. Ein Download erscheint erst nach der vollständigen Dateiprüfung."}
        </DataNotice>
      </div>
    );
  }
  if (certificate.status === "valid" && !downloadAvailable) {
    return (
      <div className="mt-8">
        <DataNotice>
          Das Zertifikat ist als gültig registriert, aber die PDF-Datei konnte
          noch nicht vollständig geprüft werden. Der Download bleibt bis dahin
          sicher deaktiviert.
        </DataNotice>
      </div>
    );
  }
  return null;
}

function missingCertificateCopy(data: CertificateData) {
  const review = data.legacyCertificateReview;
  if (review?.reviewStatus === "pending") {
    return {
      icon: FileSearch,
      title: "Dein historischer Nachweis wird geprüft",
      description:
        "Dein übernommener Kursabschluss bleibt erhalten. Der gemeldete Zertifikatsstatus wird anhand der Quelldaten menschlich geprüft und erst danach zugeordnet oder neu ausgestellt.",
      action: "Zum Kontakt",
      href: "/kontakt",
    };
  }
  if (review?.reviewStatus === "verified") {
    return {
      icon: ShieldCheck,
      title: "Dein historischer Nachweis ist bestätigt",
      description:
        "Die Admin-Prüfung ist abgeschlossen. Zuordnung oder kontrollierte Neuausstellung des Zertifikats stehen noch aus; dabei werden keine Quizdaten erfunden.",
      action: "Zum Kontakt",
      href: "/kontakt",
    };
  }
  if (
    review?.reviewStatus === "rejected" &&
    !data.confirmationRequired &&
    !data.retryAvailable
  ) {
    return {
      icon: AlertCircle,
      title: "Der Zertifikatsverweis wurde nicht bestätigt",
      description:
        "Der importierte Status reichte als Nachweis nicht aus. Dein übernommener Lernfortschritt bleibt davon unberührt. Bitte wende dich bei Rückfragen an den Support.",
      action: "Support kontaktieren",
      href: "/kontakt",
    };
  }
  if (review?.reviewStatus === "resolved") {
    return {
      icon: ShieldCheck,
      title: "Die historische Prüfung ist abgeschlossen",
      description:
        "Die Zertifikatszuordnung wurde bearbeitet. Die sichere Bereitstellung wird gerade aktualisiert; bitte lade diese Seite in einem Moment erneut.",
      action: "Zum Kontakt",
      href: "/kontakt",
    };
  }
  if (data.courseCompleted) {
    return {
      icon: Award,
      title: data.confirmationRequired
        ? "Bestätige jetzt deinen Zertifikatsnamen"
        : "Dein Zertifikat wird vorbereitet",
      description: data.confirmationRequired
        ? "Dein Kursabschluss ist sicher gespeichert. Prüfe deinen vollständigen Vor- und Nachnamen und bestätige ihn ausdrücklich, bevor das Zertifikat einmalig ausgestellt wird."
        : "Dein Lernfortschritt ist vollständig. Die serverseitige Ausstellung oder sichere Statusprüfung ist noch nicht abgeschlossen; bitte aktualisiere die Seite in einem Moment erneut.",
      action: "Zur Schulung",
      href: "/schulung",
    };
  }
  return {
    icon: LockKeyhole,
    title: "Dein Zertifikat ist noch gesperrt",
    description:
      "Dein Zertifikat wird freigeschaltet, sobald du alle sieben Lektionen und Wissenstests erfolgreich abgeschlossen hast.",
    action: "Schulung fortsetzen",
    href: "/schulung",
  };
}

export default async function CertificatePage() {
  const data = await loadCertificate();
  const certificate = data.certificate;
  const completeProfile = Boolean(
    certificate?.fullName && certificate.number && certificate.issuedAt,
  );
  const downloadReady = data.downloadAvailable && completeProfile;

  return (
    <div className="mx-auto max-w-6xl">
      <PageIntro
        eyebrow="Dein Abschluss"
        title="Zertifikat"
        description="Nach sieben bestandenen Lektionen bestätigst du zuerst den exakten Namen. Erst danach wird dein persönliches Abschlusszertifikat einmalig erstellt und hier sicher bereitgestellt."
      />

      {data.loadFailed ? (
        <div className="mt-8">
          <DataNotice>
            Der Zertifikatsstatus konnte gerade nicht geladen werden. Bitte
            aktualisiere die Seite später erneut.
          </DataNotice>
        </div>
      ) : null}
      {!data.hasAccess && !data.loadFailed ? (
        <div className="mt-8">
          <DataNotice>
            Für dieses Konto ist aktuell kein aktiver Schulungszugang
            hinterlegt.
          </DataNotice>
        </div>
      ) : null}

      {certificate ? (
        <>
          {data.confirmationRequired ? (
            <section className="mt-8 rounded-2xl border border-gold/35 bg-white p-6 shadow-card sm:p-7">
              <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
                Verbindliche Prüfung erforderlich
              </p>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-navy">
                Name vor der einmaligen Ausstellung bestätigen
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                Ein fehlgeschlagener technischer Versuch stellt noch kein
                Zertifikat dar. Bestätige jetzt den exakten Namen; anschließend
                kann die sichere Erstellung fortgesetzt werden.
              </p>
              <CertificateConfirmationDialog
                suggestedName={data.suggestedCertificateName}
                className="mt-5"
              />
            </section>
          ) : null}
          <CertificateNotice
            certificate={certificate}
            downloadAvailable={data.downloadAvailable}
            retryAvailable={data.retryAvailable}
          />
          {!completeProfile ? (
            <div className="mt-8">
              <DataNotice>
                Das Zertifikat ist hinterlegt, aber die Anzeigedaten sind noch
                nicht vollständig verfügbar. Der Download bleibt bis zur
                sicheren Prüfung deaktiviert.
              </DataNotice>
            </div>
          ) : null}

          <section
            className="mt-8 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6"
            aria-labelledby="certificate-preview-title"
          >
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
                  Persönliches Abschlusszertifikat
                </p>
                <h2
                  id="certificate-preview-title"
                  className="mt-2 font-serif text-2xl font-semibold text-navy"
                >
                  Deine Zertifikatsvorschau
                </h2>
              </div>
              <span
                className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${statusPresentation(certificate.status).className}`}
              >
                <ShieldCheck aria-hidden="true" className="size-4" />
                {statusPresentation(certificate.status).label}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl bg-[#eee7de] p-4 sm:p-7">
              <CertificatePreview
                fullName={certificate.fullName}
                number={certificate.number}
                issuedAt={certificate.issuedAt}
                courseVersion={certificate.courseVersion}
              />
            </div>
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border border-line bg-white p-6 sm:p-7">
              <h2 className="font-serif text-xl font-semibold text-navy">
                Zertifikatsdaten
              </h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-ivory p-4">
                  <dt className="text-xs font-bold text-muted">Name</dt>
                  <dd className="mt-1.5 font-semibold text-navy">
                    {certificate.fullName ?? "Nicht verfügbar"}
                  </dd>
                </div>
                <div className="rounded-xl bg-ivory p-4">
                  <dt className="text-xs font-bold text-muted">
                    Zertifikatsnummer
                  </dt>
                  <dd className="mt-1.5 font-mono text-sm font-semibold text-navy">
                    {certificate.number ?? "Nicht verfügbar"}
                  </dd>
                </div>
                <div className="rounded-xl bg-ivory p-4">
                  <dt className="text-xs font-bold text-muted">
                    Ausstellungsdatum
                  </dt>
                  <dd className="mt-1.5 font-semibold text-navy">
                    {certificate.issuedAt ?? "Nicht verfügbar"}
                  </dd>
                </div>
                <div className="rounded-xl bg-ivory p-4">
                  <dt className="text-xs font-bold text-muted">Kursversion</dt>
                  <dd className="mt-1.5 font-semibold text-navy">
                    {certificate.courseVersion ?? "Nicht verfügbar"}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl bg-navy p-6 text-white sm:p-7">
              <Award aria-hidden="true" className="size-8 text-[#dfc79f]" />
              <h2 className="mt-4 font-serif text-xl font-semibold">
                Sicher bereitgestellt
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Der PDF-Download wird bei jedem Abruf authentifiziert. Über die
                öffentliche Prüfung werden keine E-Mail- oder Adressdaten
                angezeigt.
              </p>
              <div className="mt-6 space-y-3">
                {downloadReady ? (
                  <a
                    href="/api/certificate/download"
                    className={buttonStyles({
                      variant: "gold",
                      className: "w-full",
                    })}
                  >
                    <Download aria-hidden="true" className="size-4" />
                    PDF herunterladen
                  </a>
                ) : (
                  <span
                    className={buttonStyles({
                      variant: "gold",
                      className: "w-full cursor-not-allowed opacity-50",
                    })}
                    aria-disabled="true"
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Download nicht verfügbar
                  </span>
                )}
                {certificate.number ? (
                  <Link
                    href={`/zertifikat/pruefen?nummer=${encodeURIComponent(certificate.number)}`}
                    className={buttonStyles({
                      variant: "secondary",
                      className:
                        "w-full border-white/40 bg-transparent text-white hover:bg-white/10",
                    })}
                  >
                    Zertifikat prüfen
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : (
        <MissingCertificate data={data} />
      )}
    </div>
  );
}

function MissingCertificate({ data }: { data: CertificateData }) {
  const copy = missingCertificateCopy(data);
  const Icon = copy.icon;
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="grid gap-0 lg:grid-cols-[1.05fr_1fr]">
        <div className="grid min-h-80 place-items-center bg-[#f1ebe3] p-8 text-center">
          <div>
            <span className="mx-auto grid size-16 place-items-center rounded-full border border-gold/35 bg-white text-navy shadow-sm">
              <Icon aria-hidden="true" className="size-7" />
            </span>
            <h2 className="mt-5 font-serif text-2xl font-semibold text-navy">
              {copy.title}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              {copy.description}
            </p>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
            Dein Fortschritt
          </p>
          <p className="mt-3 font-serif text-4xl font-semibold text-navy">
            {data.loadFailed ? "–" : `${data.completedCount} von 7`}
          </p>
          <ProgressBar
            value={data.loadFailed ? 0 : (data.completedCount / 7) * 100}
            label="Abgeschlossene Lektionen"
            className="mt-5"
          />
          {data.openLessons.length ? (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-navy">Noch offen</h3>
              <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto text-sm text-muted">
                {data.openLessons.map((lesson) => (
                  <li key={lesson} className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line">
                      <Check
                        aria-hidden="true"
                        className="size-2.5 opacity-0"
                      />
                    </span>
                    {lesson}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.confirmationRequired ? (
            <CertificateConfirmationDialog
              suggestedName={data.suggestedCertificateName}
              className="mt-6"
            />
          ) : data.retryAvailable ? (
            <CertificateRetryButton className="mt-6" />
          ) : (
            <Link
              href={copy.href}
              className={buttonStyles({
                variant: "primary",
                className: "mt-6",
              })}
            >
              {copy.action}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
