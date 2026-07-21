import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  inverse = false,
  className,
}: {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-3",
        inverse ? "text-white" : "text-navy",
        className,
      )}
      aria-label="Schulung Wimpernverlängerung – Startseite"
    >
      <Image
        src="/brand/logo-mark-selected.png"
        alt=""
        width={44}
        height={44}
        className="size-10 shrink-0 sm:size-11"
        aria-hidden="true"
      />
      {!compact && (
        <span className="leading-none">
          <span className="block font-serif text-[1.05rem] font-semibold tracking-[-0.025em]">
            Schulung
          </span>
          <span
            className={cn(
              "mt-1 block text-[0.62rem] font-bold tracking-[0.13em] uppercase",
              inverse ? "text-white/60" : "text-muted",
            )}
          >
            Wimpernverlängerung
          </span>
        </span>
      )}
    </Link>
  );
}
