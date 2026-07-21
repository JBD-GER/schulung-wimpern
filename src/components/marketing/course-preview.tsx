import { Check, CirclePlay, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { LESSONS } from "@/data/course";

export function CoursePreview() {
  return (
    <figure
      className="relative mx-auto w-full max-w-[620px] pb-10"
      aria-label="Vorschau der Lernplattform"
    >
      <div
        className="absolute -inset-x-4 top-12 bottom-0 rounded-[2.5rem] bg-beige/60 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/80 bg-white shadow-[0_32px_90px_rgba(29,39,51,0.18)]">
        <div className="flex items-center justify-between border-b border-line bg-[#fdfcfb] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="size-2 rounded-full bg-gold/40" />
            <span className="size-2 rounded-full bg-beige" />
            <span className="size-2 rounded-full bg-navy/20" />
          </div>
          <span className="text-[0.62rem] font-extrabold tracking-[0.15em] text-muted uppercase">
            Plattform-Vorschau
          </span>
          <LockKeyhole className="size-3.5 text-success" aria-hidden="true" />
        </div>

        <div className="grid sm:grid-cols-[0.82fr_1.18fr]">
          <div className="hidden bg-navy p-5 text-white sm:block">
            <div className="mb-7 flex items-center gap-2">
              <Image
                src="/brand/logo-mark-selected.png"
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-serif text-sm font-semibold">
                  Deine Schulung
                </p>
                <p className="mt-0.5 text-[0.55rem] text-white/50">
                  7 strukturierte Lektionen
                </p>
              </div>
            </div>
            <p className="text-[0.58rem] font-bold tracking-[0.14em] text-white/45 uppercase">
              Kursnavigation
            </p>
            <div className="mt-3 space-y-2.5">
              {LESSONS.slice(0, 5).map((lesson, index) => (
                <div
                  key={lesson.position}
                  className={
                    index === 0
                      ? "flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-2 text-[0.58rem] text-white"
                      : "flex items-center gap-2 px-2.5 py-1 text-[0.58rem] text-white/50"
                  }
                >
                  <span className={index === 0 ? "text-gold" : "text-white/30"}>
                    0{lesson.position}
                  </span>
                  <span className="truncate">{lesson.title}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.58rem] font-extrabold tracking-[0.14em] text-gold uppercase">
                  Lektion 1 von 7
                </p>
                <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-[0.58rem] font-bold text-success">
                  Verfügbar
                </span>
              </div>
              <p className="mt-1.5 font-serif text-base leading-tight font-semibold text-navy sm:text-lg">
                Rechtliche Absicherung &amp; Datenschutz
              </p>
            </div>

            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-navy">
              <div
                className="absolute inset-0 opacity-40"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 72% 28%, #B08D57 0, transparent 30%), linear-gradient(140deg, #1D2733, #36485C)",
                }}
              />
              <div className="relative text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm">
                  <CirclePlay
                    className="size-6"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <p className="mt-3 text-[0.62rem] font-bold tracking-wide text-white/65">
                  Geschütztes Lernvideo
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4">
              <div>
                <div className="flex justify-between text-[0.55rem] font-bold text-muted">
                  <span>Kursfortschritt</span>
                  <span>Schritt für Schritt</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-beige">
                  <div className="h-full w-[14.285%] rounded-full bg-gold" />
                </div>
              </div>
              <span className="grid size-8 place-items-center rounded-full bg-success/10 text-success">
                <Check className="size-4" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <div
        className="absolute bottom-0 left-3 w-[11.5rem] rotate-[-1.5deg] rounded-xl border border-gold/35 bg-[#fffdfa] p-3 shadow-[0_14px_35px_rgba(29,39,51,0.16)] sm:left-8 sm:w-[13rem]"
        aria-hidden="true"
      >
        <div className="border border-navy/65 px-3 py-2 text-center outline outline-1 -outline-offset-2 outline-gold/45">
          <p className="text-[0.43rem] font-extrabold tracking-[0.13em] text-gold uppercase">
            Persönlicher Abschluss
          </p>
          <p className="mt-1 font-serif text-[0.72rem] font-semibold tracking-[0.12em] text-navy">
            ZERTIFIKAT
          </p>
          <p className="mt-0.5 text-[0.42rem] text-muted">
            DEIN NAME · Musteransicht
          </p>
        </div>
      </div>
      <figcaption className="sr-only">
        Exemplarische Kurs-, Dashboard- und Zertifikatsvorschau ohne öffentlich
        zugängliche Kursvideos.
      </figcaption>
    </figure>
  );
}
