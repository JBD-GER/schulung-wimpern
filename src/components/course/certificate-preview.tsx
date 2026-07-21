import { Award, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { COURSE } from "@/data/course";

export function CertificatePreview({
  fullName,
  number,
  issuedAt,
  courseVersion,
}: {
  fullName: string | null;
  number: string | null;
  issuedAt: string | null;
  courseVersion: string | null;
}) {
  return (
    <div
      className="relative aspect-[1.414/1] min-w-[42rem] overflow-hidden bg-[#fffdf9] p-5 text-navy shadow-[0_18px_55px_rgba(29,39,51,.15)]"
      aria-label="Vorschau deines Zertifikats"
    >
      <div
        className="absolute inset-3 border-2 border-navy"
        aria-hidden="true"
      />
      <div
        className="absolute inset-[1.15rem] border border-gold"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col items-center justify-between px-10 py-8 text-center">
        <div>
          <Image
            src="/brand/logo-mark-selected.png"
            alt=""
            width={48}
            height={48}
            className="mx-auto size-12"
            aria-hidden="true"
          />
          <p className="mt-4 text-[0.55rem] font-extrabold tracking-[0.28em] text-gold uppercase">
            Schulung Wimpernverlängerung
          </p>
        </div>

        <div>
          <p className="font-serif text-[2rem] tracking-[0.14em]">ZERTIFIKAT</p>
          <div className="mx-auto mt-3 h-px w-28 bg-gold" aria-hidden="true" />
          <p className="mt-5 text-[0.68rem] text-muted">
            Hiermit wird bestätigt, dass
          </p>
          <p className="mt-2 font-serif text-[1.7rem] font-semibold">
            {fullName ?? "—"}
          </p>
          <p className="mt-3 text-[0.68rem] leading-5 text-muted">
            die Online-Schulung
            <br />
            <strong className="text-navy">{COURSE.certificateTitle}</strong>
            <br />
            erfolgreich abgeschlossen hat.
          </p>
        </div>

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-end gap-8 text-[0.55rem] text-muted">
          <div className="border-t border-navy/30 pt-2 text-left">
            <span className="block font-bold text-navy">{issuedAt ?? "—"}</span>
            Ausstellungsdatum
          </div>
          <div className="grid size-16 place-items-center rounded-full border border-gold bg-[#f6efe5]">
            <Award
              aria-hidden="true"
              className="size-7 text-gold"
              strokeWidth={1.35}
            />
          </div>
          <div className="border-t border-navy/30 pt-2 text-right">
            <span className="block font-bold text-navy">{number ?? "—"}</span>
            Zertifikatsnummer · Version {courseVersion ?? "—"}
          </div>
        </div>
      </div>
      <CheckCircle2
        aria-hidden="true"
        className="absolute right-7 bottom-7 size-4 text-success"
      />
    </div>
  );
}
