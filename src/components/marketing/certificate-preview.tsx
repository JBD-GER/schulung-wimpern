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
      <div className="relative aspect-[1.414/1] min-h-[190px] w-full min-w-0 overflow-hidden rounded-2xl border border-gold/40 bg-[#fffdfa] p-3 shadow-[0_24px_70px_rgba(29,39,51,0.14)] sm:min-h-[230px] sm:p-4">
        <div className="flex h-full flex-col items-center justify-between border border-navy/80 p-3 text-center outline outline-1 -outline-offset-2 outline-gold/60 sm:p-5">
          <div className="flex w-full items-center justify-between text-[0.48rem] font-extrabold tracking-[0.16em] text-muted uppercase sm:text-[0.6rem]">
            <span className="flex items-center gap-2">
              <Image
                src="/brand/logo-mark-selected.png"
                alt=""
                width={24}
                height={24}
                className="size-5 sm:size-6"
                aria-hidden="true"
              />
              <span>Schulung Wimpernverlängerung</span>
            </span>
            <span className="rounded-full border border-gold/50 px-2 py-1 text-gold">
              Musteransicht
            </span>
          </div>
          <div className="my-2">
            <Award
              className="mx-auto mb-1.5 size-6 text-gold sm:size-8"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="font-serif text-xl font-semibold tracking-[0.12em] text-navy sm:text-3xl">
              ZERTIFIKAT
            </p>
            <p className="mt-1 text-[0.55rem] text-muted sm:text-xs">
              Hiermit wird der erfolgreiche Abschluss bestätigt für
            </p>
            <p className="mt-2 border-b border-gold/50 px-6 pb-1 font-serif text-base font-semibold text-navy sm:text-xl">
              DEIN NAME
            </p>
            <p className="mt-2 text-[0.55rem] font-bold text-navy sm:text-xs">
              Professionelle 1:1 Wimpernverlängerung
            </p>
          </div>
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-end gap-3 text-[0.45rem] text-muted sm:text-[0.6rem]">
            <div className="border-t border-navy/30 pt-1">
              Ausstellungsdatum
            </div>
            <div className="grid size-9 place-items-center rounded-full border border-gold/60 bg-gold/5 text-gold sm:size-11">
              <Check className="size-4" strokeWidth={2} aria-hidden="true" />
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
