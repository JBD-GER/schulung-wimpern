import { Award, Check } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function CertificatePreview({ className }: { className?: string }) {
  return (
    <figure className={cn("relative min-w-0 max-w-full", className)}>
      <div
        className="absolute -inset-3 rounded-[1.75rem] bg-gold/10 blur-xl"
        aria-hidden="true"
      />
      <div className="relative aspect-[1.414/1] w-full min-w-0 overflow-hidden rounded-2xl border border-gold/40 bg-[#fffdfa] p-2 shadow-[0_24px_70px_rgba(29,39,51,0.14)] sm:min-h-[230px] sm:p-4">
        <div className="flex h-full flex-col items-center justify-between border border-navy/80 p-2 text-center outline outline-1 -outline-offset-2 outline-gold/60 sm:p-5">
          <div className="flex w-full items-center justify-between text-[0.42rem] font-extrabold tracking-[0.12em] text-muted uppercase sm:text-[0.6rem] sm:tracking-[0.16em]">
            <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <Image
                src="/brand/logo-mark-selected.png"
                alt=""
                width={24}
                height={24}
                className="size-4 shrink-0 sm:size-6"
                aria-hidden="true"
              />
              <span className="truncate">Schulung Wimpernverlängerung</span>
            </span>
            <span className="ml-1 shrink-0 rounded-full border border-gold/50 px-1.5 py-0.5 text-gold sm:px-2 sm:py-1">
              Musteransicht
            </span>
          </div>
          <div className="my-1 sm:my-2">
            <Award
              className="mx-auto mb-0.5 size-5 text-gold sm:mb-1.5 sm:size-8"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="font-serif text-lg font-semibold tracking-[0.1em] text-navy sm:text-3xl sm:tracking-[0.12em]">
              ZERTIFIKAT
            </p>
            <p className="mt-0.5 text-[0.48rem] text-muted sm:mt-1 sm:text-xs">
              Hiermit wird der erfolgreiche Abschluss bestätigt für
            </p>
            <p className="mt-1 border-b border-gold/50 px-5 pb-0.5 font-serif text-sm font-semibold text-navy sm:mt-2 sm:px-6 sm:pb-1 sm:text-xl">
              DEIN NAME
            </p>
            <p className="mt-1 text-[0.48rem] font-bold text-navy sm:mt-2 sm:text-xs">
              Professionelle 1:1 Wimpernverlängerung
            </p>
          </div>
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-end gap-2 text-[0.4rem] text-muted sm:gap-3 sm:text-[0.6rem]">
            <div className="border-t border-navy/30 pt-1">
              Ausstellungsdatum
            </div>
            <div className="grid size-7 place-items-center rounded-full border border-gold/60 bg-gold/5 text-gold sm:size-11">
              <Check
                className="size-3.5 sm:size-4"
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
            <div className="border-t border-navy/30 pt-1">
              Zertifikatsnummer
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Musteransicht des persönlichen Abschlusszertifikats mit Name,
        Ausstellungsdatum und Zertifikatsnummer.
      </figcaption>
    </figure>
  );
}
