import {
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  GraduationCap,
  Laptop,
  LockKeyhole,
  MailCheck,
  MonitorSmartphone,
  PlayCircle,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  UserRound,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CertificatePreview } from "@/components/marketing/certificate-preview";
import { FaqList } from "@/components/marketing/faq-list";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  PriceDisplay,
  type PublicProductView,
} from "@/components/marketing/price-display";
import { SectionHeading } from "@/components/marketing/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { COURSE_ACCESS_DESCRIPTION } from "@/data/access-policy";
import { COURSE, LESSONS } from "@/data/course";
import type { FaqItem } from "@/components/marketing/faq-list";

const trustPoints = [
  "Sofortiger Zugang nach erfolgreicher Zahlung",
  "Sieben strukturierte Lektionen",
  "Lernen im eigenen Tempo",
  "Einmalzahlung statt Abonnement",
  "Persönliches, verifizierbares Abschlusszertifikat",
  "Rechnung im Portal",
] as const;

const audiences = [
  {
    title: "Einsteigerinnen",
    text: "Du startest ohne Vorkenntnisse und wünschst dir eine nachvollziehbare Grundlage.",
    icon: GraduationCap,
  },
  {
    title: "Quereinsteigerinnen",
    text: "Du möchtest dich strukturiert in ein neues Beauty-Thema einarbeiten.",
    icon: RotateCcw,
  },
  {
    title: "Kosmetikerinnen",
    text: "Du möchtest dein bestehendes Fachwissen um die 1:1-Technik erweitern.",
    icon: UserRound,
  },
  {
    title: "Gründerinnen",
    text: "Du planst deine Selbstständigkeit und willst fachliche sowie organisatorische Themen verbinden.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Beauty-Dienstleisterinnen",
    text: "Du möchtest dein Angebot fundiert um Wimpernverlängerung ergänzen.",
    icon: CheckCircle2,
  },
  {
    title: "Flexibel Lernende",
    text: "Du möchtest zeitlich und örtlich unabhängig am Smartphone, Tablet oder Computer lernen.",
    icon: Laptop,
  },
] as const;

const learningOutcomes = [
  "Rechtliche und organisatorische Grundlagen",
  "Grundlagen der professionellen 1:1-Technik",
  "Auswahl und sichere Verwendung von Materialien",
  "Isolierung, Applikation und Kleberführung",
  "Pflege, Haltbarkeit, Refill und Entfernung",
  "Professioneller Online-Auftritt",
  "Lokale Kundengewinnung",
  "Praktische Arbeitsschritte von A bis Z",
] as const;

const certificateFeatures = [
  "Automatische Erstellung nach erfolgreichem Abschluss",
  "Personalisierung mit deinem vollständigen Namen",
  "Eindeutige Zertifikatsnummer und Ausstellungsdatum",
  "QR-Code beziehungsweise Verifikationslink",
  "Download in deinem persönlichen Dashboard",
  "Zusätzlicher Versand als PDF per E-Mail",
] as const;

const platformFeatures = [
  {
    title: "Persönlicher Login",
    text: "Nur du gelangst mit deinem Konto in den Teilnehmerbereich.",
    icon: UserRound,
  },
  {
    title: "Geschützter Kursbereich",
    text: "Lernvideos werden nicht als frei zugängliche Dateien veröffentlicht.",
    icon: LockKeyhole,
  },
  {
    title: "Gespeicherter Fortschritt",
    text: "Du siehst jederzeit, welche Lektionen bereits erfolgreich abgeschlossen sind.",
    icon: BookOpenCheck,
  },
  {
    title: "Auf allen Geräten",
    text: "Lerne auf aktuellen Smartphones, Tablets und Desktop-Browsern.",
    icon: MonitorSmartphone,
  },
] as const;

const transparentBenefits = [
  {
    title: "Exakter Kursplan",
    text: "Titel, Reihenfolge, Laufzeiten und Lernlogik sind vor der Buchung einsehbar.",
    icon: BookOpenCheck,
  },
  {
    title: "Klare Lernkontrolle",
    text: "Jede Lektion endet mit fünf Fragen; bestanden ist sie mit mindestens vier richtigen Antworten.",
    icon: FileCheck2,
  },
  {
    title: "Sichere Einmalzahlung",
    text: "Kein Abonnement und keine automatische Verlängerung. Verfügbare Zahlungsarten siehst du im Checkout.",
    icon: ShieldCheck,
  },
  {
    title: "Nachvollziehbarer Abschluss",
    text: "Das persönliche Abschlusszertifikat erhältst du erst nach allen sieben bestandenen Lektionen.",
    icon: GraduationCap,
  },
] as const;

export function LandingPage({
  product,
  faqs,
}: {
  product: PublicProductView;
  faqs: readonly FaqItem[];
}) {
  const productName = product.name || COURSE.productName;

  return (
    <MarketingShell>
      <section
        id="schulung"
        className="relative overflow-hidden border-b border-line bg-white"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute -top-40 -right-28 size-[34rem] rounded-full bg-beige/45 blur-3xl" />
          <div className="absolute bottom-8 -left-44 size-[26rem] rounded-full bg-gold/8 blur-3xl" />
        </div>
        <Container className="relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:gap-12 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-ivory px-3.5 py-2 text-[0.68rem] font-extrabold tracking-[0.12em] text-navy uppercase sm:text-xs">
              <span
                className="size-1.5 rounded-full bg-gold"
                aria-hidden="true"
              />
              100 % online · Einmalzahlung · Persönliches Abschlusszertifikat
            </p>
            <h1 className="mt-6 max-w-3xl hyphens-auto font-serif text-[2.55rem] leading-[1.06] font-semibold tracking-[-0.045em] text-navy sm:text-5xl lg:text-[3.75rem]">
              Online-Schulung Wimpernverlängerung: 1:1-Technik professionell
              lernen
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
              Lerne die Grundlagen der professionellen 1:1-Wimpernverlängerung
              flexibel online – von Recht und Hygiene über Material, Kleber und
              Pflege bis zur praktischen Anwendung und Kundengewinnung.
            </p>

            <div className="mt-7 rounded-2xl border border-line bg-ivory/70 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <PriceDisplay product={product} />
              <div className="mt-3 text-xs font-semibold text-muted sm:mt-0 sm:text-right">
                <p>Unbefristeter Kurszugang</p>
                <p className="mt-1 text-success">Lernen im eigenen Tempo</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                href="/checkout"
                size="lg"
                className="w-full sm:w-auto"
              >
                Schulungsplatz buchen
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink
                href="#inhalte"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                Kursinhalte ansehen
              </ButtonLink>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden="true"
              />
              Sicherer Checkout im Design der Plattform. Zahlungsdaten werden
              direkt durch Stripe verarbeitet.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[31rem] lg:max-w-none">
            <div
              className="absolute -inset-x-5 top-[12%] bottom-[8%] rounded-[3rem] bg-beige/70 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative mx-auto w-[88%] max-w-[27rem] sm:w-[82%] lg:w-[82%]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-white/80 bg-beige shadow-[0_32px_90px_rgba(29,39,51,0.2)]">
                <Image
                  src="/brand/lea.png"
                  alt="Lea Kirfel, Kursleiterin der Online-Schulung Wimpernverlängerung"
                  fill
                  priority
                  sizes="(min-width: 1024px) 28vw, (min-width: 640px) 60vw, 88vw"
                  className="object-cover"
                />
              </div>

              <div
                className="certificate-float relative z-10 mx-auto -mt-7 w-[13.75rem] max-w-[82%] rounded-xl border border-gold/35 bg-[#fffdfa] p-3 shadow-[0_14px_35px_rgba(29,39,51,0.16)]"
                aria-hidden="true"
              >
                <div className="border border-navy/65 px-3 py-2 text-center outline outline-1 -outline-offset-2 outline-gold/45">
                  <p className="text-[0.43rem] font-extrabold tracking-[0.13em] text-gold uppercase">
                    Persönlicher Abschluss
                  </p>
                  <p className="mt-1 font-serif text-sm font-semibold tracking-[0.12em] text-navy">
                    ZERTIFIKAT
                  </p>
                  <p className="mt-0.5 text-[0.48rem] text-muted">
                    DEIN NAME · Musteransicht
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>

        <Container className="relative pb-12 sm:pb-16">
          <ul className="grid gap-x-7 gap-y-3 rounded-2xl border border-line bg-ivory/65 p-5 sm:grid-cols-2 lg:grid-cols-3 lg:p-6">
            {trustPoints.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-navy/80"
              >
                <Check
                  className="mt-1 size-4 shrink-0 text-gold"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="overflow-hidden bg-[#f1ebe4] py-20 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow="Einblick in deinen Lernbereich"
            title="Dein Fortschritt. Deine Lektionen. Alles an einem Ort."
            description="Nach der Buchung führt dich dein persönliches Dashboard durch die Schulung. Du siehst sofort, wo du stehst, und kannst mit einem Klick an der richtigen Stelle weitermachen."
            align="center"
          />
          <ul className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-2.5">
            {[
              "Lernstand auf einen Blick",
              "Direkt zur nächsten Lektion",
              "Für Smartphone, Tablet und Desktop",
            ].map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-white/70 px-3.5 py-2 text-xs font-bold text-navy shadow-sm"
              >
                <CheckCircle2
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="relative mx-auto mt-12 hidden max-w-6xl pb-14 md:block lg:pr-16">
            <div className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-[0_28px_80px_rgba(29,39,51,.16)]">
              <div className="flex h-11 items-center gap-2 border-b border-line bg-white px-4">
                <span
                  className="size-2.5 rounded-full bg-[#d7c2a0]"
                  aria-hidden="true"
                />
                <span
                  className="size-2.5 rounded-full bg-[#e8dfd3]"
                  aria-hidden="true"
                />
                <span
                  className="size-2.5 rounded-full bg-[#b8c8bf]"
                  aria-hidden="true"
                />
                <span className="ml-3 text-[0.65rem] font-extrabold tracking-[0.14em] text-muted uppercase">
                  Persönlicher Lernbereich
                </span>
              </div>
              <Image
                src="/brand/dashboard/dashboard-desktop.png"
                alt="Beispielansicht des persönlichen Dashboards mit Lernfortschritt und nächster Lektion"
                width={1440}
                height={960}
                sizes="(min-width: 1280px) 1120px, 90vw"
                className="h-auto w-full"
              />
            </div>

            <div className="absolute right-0 bottom-0 hidden w-[13.5rem] overflow-hidden rounded-[2rem] border-[5px] border-navy bg-white shadow-[0_24px_60px_rgba(29,39,51,.28)] lg:block">
              <div className="relative aspect-[9/14] overflow-hidden bg-ivory">
                <Image
                  src="/brand/dashboard/dashboard-mobile.png"
                  alt="Mobile Ansicht des persönlichen Lernbereichs"
                  fill
                  sizes="216px"
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-10 w-[min(82vw,17.5rem)] overflow-hidden rounded-[2.2rem] border-[5px] border-navy bg-white shadow-[0_24px_65px_rgba(29,39,51,.24)] md:hidden">
            <div className="relative aspect-[9/14] overflow-hidden bg-ivory">
              <Image
                src="/brand/dashboard/dashboard-mobile.png"
                alt="Mobile Beispielansicht des persönlichen Dashboards"
                fill
                sizes="280px"
                className="object-cover object-top"
              />
            </div>
          </div>
          <p className="mt-5 text-center text-[0.68rem] font-semibold tracking-[0.08em] text-muted uppercase">
            Beispielansicht mit fiktiven Teilnehmerdaten
          </p>
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow="Für deinen Einstieg"
            title="Für wen ist die Schulung geeignet?"
            description="Der Kurs ist als klarer Einstieg aufgebaut und verbindet fachliche Grundlagen mit praktischer Orientierung – unabhängig davon, ob du ganz neu beginnst oder dein Beauty-Angebot erweitern möchtest."
            align="center"
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {audiences.map(({ title, text, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-line bg-white p-6 shadow-card transition-transform hover:-translate-y-0.5"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-gold/10 text-gold">
                  <Icon
                    className="size-5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <h3 className="mt-5 font-serif text-xl font-semibold text-navy">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-line bg-white py-20 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:gap-20">
          <div className="lg:sticky lg:top-28">
            <SectionHeading
              eyebrow="Dein Lernziel"
              title="Was du in der Schulung lernst"
              description="Du erarbeitest dir ein zusammenhängendes Verständnis der 1:1-Wimpernverlängerung – von verantwortungsvoller Vorbereitung bis zur praktischen Anwendung und professionellen Sichtbarkeit."
            />
            <div className="mt-7 rounded-2xl border border-gold/25 bg-ivory p-5 text-sm leading-6 text-muted">
              <p className="font-bold text-navy">Realistisch lernen</p>
              <p className="mt-1.5">
                Ein Onlinekurs ersetzt weder sorgfältige praktische Übung noch
                eine individuelle medizinische, versicherungsbezogene oder
                rechtliche Beratung.
              </p>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {learningOutcomes.map((outcome, index) => (
              <li
                key={outcome}
                className="flex min-h-28 items-start gap-4 rounded-2xl border border-line bg-ivory/55 p-5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-gold/40 bg-white text-xs font-extrabold text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="pt-1 text-sm font-bold leading-6 text-navy">
                  {outcome}
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="inhalte" className="py-20 sm:py-24">
        <Container>
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Exakter Kursplan"
              title="Sieben Lektionen. Ein klarer roter Faden."
              description={`${COURSE.learningScope}. Die sichtbaren Videolaufzeiten betragen zusammen rund vier Stunden und 54 Minuten.`}
            />
            <div className="flex flex-wrap gap-2 text-xs font-bold text-navy">
              <span className="rounded-full border border-line bg-white px-3 py-2">
                Niveau: {COURSE.level}
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-2">
                7 Videos
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-2">
                7 Wissenstests
              </span>
            </div>
          </div>

          <ol className="mt-12 grid gap-4">
            {LESSONS.map((lesson) => (
              <li
                key={lesson.position}
                className="group grid gap-5 rounded-2xl border border-line bg-white p-5 shadow-card sm:grid-cols-[4.5rem_1fr_auto] sm:items-center sm:p-6 lg:px-7"
              >
                <div className="flex items-center gap-3 sm:block">
                  <span className="font-serif text-3xl font-semibold text-gold">
                    {String(lesson.position).padStart(2, "0")}
                  </span>
                  <span className="text-[0.62rem] font-extrabold tracking-[0.12em] text-muted uppercase sm:mt-1 sm:block">
                    Lektion
                  </span>
                </div>
                <div>
                  {lesson.area ? (
                    <p className="mb-1.5 text-[0.65rem] font-extrabold tracking-[0.13em] text-gold uppercase">
                      {lesson.area}
                    </p>
                  ) : null}
                  <h3 className="hyphens-auto font-serif text-xl leading-snug font-semibold text-navy sm:text-2xl">
                    {lesson.title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                    {lesson.summary}
                  </p>
                  {lesson.position === 7 ? (
                    <ul
                      className="mt-3 flex flex-wrap gap-1.5"
                      aria-label="Inhalte des Praxisteils"
                    >
                      {lesson.topics.map((topic) => (
                        <li
                          key={topic}
                          className="rounded-full border border-line bg-ivory px-2.5 py-1 text-[0.65rem] font-semibold text-muted"
                        >
                          {topic}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    {lesson.duration}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-success">
                    <Video className="size-3.5" aria-hidden="true" />
                    Video + Wissenstest
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section
        id="ablauf"
        className="border-y border-line bg-white py-20 sm:py-24"
      >
        <Container>
          <SectionHeading
            eyebrow="So funktioniert es"
            title="Vom Checkout bis zum Zertifikat"
            description="Der Ablauf ist bewusst geradlinig: ein Produkt, eine Buchung und ein nachvollziehbarer Lernpfad durch alle sieben Lektionen."
            align="center"
          />
          <ol className="relative mt-12 grid gap-5 lg:grid-cols-3">
            {[
              {
                title: "Schulungsplatz sicher buchen",
                text: "Du legst deine Zugangsdaten fest und bezahlst per Einmalzahlung. Erst nach bestätigter Zahlung wird dein Konto erstellt und du gelangst direkt ins Dashboard.",
                icon: UserRound,
              },
              {
                title: "Videos ansehen und Wissenstests absolvieren",
                text: "Nach jedem ausreichend angesehenen Video beantwortest du fünf Fragen. Vier richtige Antworten reichen zum Bestehen.",
                icon: PlayCircle,
              },
              {
                title: "Alle Lektionen bestehen und Zertifikat erhalten",
                text: "Nach der siebten bestandenen Lektion prüfst und bestätigst du deinen Namen. Erst danach wird dein persönliches Abschlusszertifikat einmalig erstellt.",
                icon: GraduationCap,
              },
            ].map(({ title, text, icon: Icon }, index) => (
              <li
                key={title}
                className="relative rounded-2xl border border-line bg-ivory/50 p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-xl bg-navy text-white">
                    <Icon
                      className="size-5"
                      strokeWidth={1.7}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="font-serif text-4xl font-semibold text-beige">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-7 font-serif text-2xl leading-snug font-semibold text-navy">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container className="grid overflow-hidden rounded-3xl border border-line bg-white px-0 shadow-soft sm:px-0 lg:grid-cols-[0.75fr_1.25fr] lg:px-0">
          <div className="relative min-h-[32rem] overflow-hidden bg-navy lg:min-h-0">
            <Image
              src="/brand/lea.png"
              alt="Lea Kirfel in ihrem Studio für Wimpernverlängerung"
              fill
              sizes="(min-width: 1024px) 38vw, 100vw"
              className="object-cover object-center"
            />
            <div
              className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-navy/75 to-transparent"
              aria-hidden="true"
            />
            <p className="absolute right-6 bottom-6 left-6 text-xs font-extrabold tracking-[0.18em] text-white uppercase drop-shadow-md">
              Kursleitung
            </p>
          </div>
          <div className="p-7 sm:p-10 lg:p-14">
            <p className="text-xs font-extrabold tracking-[0.18em] text-gold uppercase">
              Deine Kursleiterin
            </p>
            <h2 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.035em] text-navy sm:text-5xl">
              Lea Kirfel
            </h2>
            <p className="mt-6 text-base leading-8 text-muted">
              Lea Kirfel arbeitet seit über sieben Jahren selbstständig als
              Wimpernstylistin und führt ihr eigenes Studio. Dadurch kennt sie
              sowohl die fachlichen Handgriffe als auch die Abläufe, auf die es
              im täglichen Arbeiten ankommt. In dieser Online-Schulung gibt sie
              ihre Praxiserfahrung verständlich weiter und begleitet dich
              Schritt für Schritt – von den Grundlagen und der Materialauswahl
              bis zur 1:1-Applikation, Nachpflege und Kundengewinnung.
            </p>
            <div className="mt-7 rounded-2xl border border-gold/25 bg-ivory p-5 text-sm leading-6 text-muted">
              <p className="font-bold text-navy">
                Aus der Praxis für die Praxis
              </p>
              <p className="mt-1.5">
                Die Inhalte orientieren sich an den Fragen und Arbeitsschritten,
                die im Studioalltag wirklich zählen: klar erklärt, praktisch
                gezeigt und sinnvoll aufeinander aufgebaut.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section
        id="zertifikat"
        className="scroll-mt-24 border-y border-line bg-white py-20 sm:scroll-mt-28 sm:py-24"
      >
        <Container className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-20">
          <CertificatePreview className="mx-auto w-full max-w-[20rem] sm:max-w-none" />
          <div>
            <SectionHeading
              eyebrow="Dein erfolgreicher Abschluss"
              title="Persönliches Abschlusszertifikat der Schulung"
              description="Nach allen sieben bestandenen Lektionen erstellt die Plattform dein personalisiertes PDF-Zertifikat und stellt es dir direkt bereit."
            />
            <ul className="mt-7 grid gap-3">
              {certificateFeatures.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 text-sm leading-6 text-navy/80"
                >
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-success"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-7 rounded-xl bg-ivory px-4 py-3 text-xs leading-5 text-muted">
              Das Zertifikat dokumentiert den Abschluss dieser Online-Schulung.
              Es ist kein staatlich anerkannter Berufsabschluss.
            </p>
          </div>
        </Container>
      </section>

      <section className="overflow-hidden bg-navy py-20 text-white sm:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <SectionHeading
              eyebrow="Sichere Lernplattform"
              title="Dein Kurs bleibt persönlich und geschützt"
              description="Die Plattform ist für konzentriertes Lernen gebaut: mit persönlichem Zugang, gespeichertem Fortschritt und geschützten Lerninhalten."
              className="[&_h2]:text-white [&_p:last-child]:text-white/62"
            />
            <p className="max-w-2xl text-sm leading-7 text-white/60 lg:ml-auto">
              {COURSE_ACCESS_DESCRIPTION} Dein Lernfortschritt wird deinem Konto
              zugeordnet und steht dir nach dem nächsten Login wieder zur
              Verfügung.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platformFeatures.map(({ title, text, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
                  <Icon
                    className="size-5"
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                </span>
                <h3 className="mt-5 font-serif text-xl font-semibold">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/58">{text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow="Nachvollziehbare Leistungen"
            title="Transparenz, die du vor der Buchung prüfen kannst"
            description="Wir veröffentlichen keine erfundenen Stimmen oder Sterne. Solange keine nachweislich freigegebenen Bewertungen vorliegen, zeigen wir dir stattdessen die überprüfbaren Eigenschaften des Kurses."
            align="center"
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {transparentBenefits.map(({ title, text, icon: Icon }) => (
              <article
                key={title}
                className="flex gap-5 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-7"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-serif text-xl font-semibold text-navy">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-line bg-white py-20 sm:py-24">
        <Container>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              eyebrow="Häufige Fragen"
              title="Alles Wichtige vor deiner Buchung"
              description="Von Zugang und Wissenstests bis Rechnung und Zertifikat: Hier findest du klare Antworten zur tatsächlichen Plattform."
            />
            <Link
              href="/fragen"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-navy hover:text-gold"
            >
              FAQ als eigene Seite
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-10">
            <FaqList items={faqs} />
          </div>
        </Container>
      </section>

      <section className="bg-ivory py-20 sm:py-24">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] bg-navy px-6 py-10 text-white shadow-[0_30px_90px_rgba(29,39,51,0.22)] sm:px-10 sm:py-14 lg:px-14">
            <div
              className="absolute top-0 right-0 size-80 translate-x-1/3 -translate-y-1/3 rounded-full border border-gold/20"
              aria-hidden="true"
            />
            <div
              className="absolute top-0 right-0 size-60 translate-x-1/3 -translate-y-1/3 rounded-full bg-gold/10 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_0.58fr] lg:items-end">
              <div>
                <p className="text-xs font-extrabold tracking-[0.18em] text-gold uppercase">
                  Bereit für deinen nächsten Schritt?
                </p>
                <h2 className="mt-4 max-w-4xl font-serif text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">
                  Starte jetzt deine Ausbildung in der professionellen
                  1:1-Wimpernverlängerung
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-white/62">
                  {productName}
                </p>
                <ul className="mt-7 grid gap-3 text-sm font-semibold text-white/78 sm:grid-cols-2">
                  {[
                    "Sieben Lektionen und Wissenstests",
                    "Geschützte Lernvideos",
                    "Ergänzende Materialien",
                    "Persönlicher Teilnehmerbereich",
                    "Zertifikat nach bestandenem Kurs",
                    "Rechnung im Portal",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-gold"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-sm">
                <PriceDisplay product={product} inverse />
                <ButtonLink
                  href="/checkout"
                  variant="gold"
                  size="lg"
                  className="mt-6 w-full"
                >
                  Schulungsplatz buchen
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <div className="mt-4 grid gap-2 text-xs text-white/55">
                  <p className="flex items-center gap-2">
                    <ReceiptText
                      className="size-3.5 text-gold"
                      aria-hidden="true"
                    />
                    Einmalzahlung · kein Abonnement
                  </p>
                  <p className="flex items-center gap-2">
                    <MailCheck
                      className="size-3.5 text-gold"
                      aria-hidden="true"
                    />
                    Zugang nach bestätigter Zahlung
                  </p>
                  <p className="flex items-center gap-2">
                    <Smartphone
                      className="size-3.5 text-gold"
                      aria-hidden="true"
                    />
                    Optimiert für Smartphone, Tablet und Desktop
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </MarketingShell>
  );
}
