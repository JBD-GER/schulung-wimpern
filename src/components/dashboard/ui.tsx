import type { ReactNode } from "react";
import {
  AlertCircle,
  Check,
  Clock3,
  Eye,
  LockKeyhole,
  Play,
} from "lucide-react";
import type { LessonUiStatus } from "@/components/dashboard/data";
import { cn } from "@/lib/utils";

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-3 text-xs font-extrabold tracking-[0.18em] text-gold uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-serif text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-navy sm:text-4xl lg:text-[2.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 max-w-2xl leading-7 text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function ProgressBar({
  value,
  label,
  showValue = true,
  className,
}: {
  value: number;
  label: string;
  showValue?: boolean;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-4 text-xs font-bold">
        <span className="text-muted">{label}</span>
        {showValue ? (
          <span className="tabular-nums text-navy">{percent} %</span>
        ) : null}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-beige/70"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-[#c5a875] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const lessonStatusConfig = {
  locked: {
    label: "Gesperrt",
    icon: LockKeyhole,
    styles: "bg-navy/[.055] text-muted",
  },
  available: {
    label: "Verfügbar",
    icon: Play,
    styles: "bg-gold/15 text-[#795f35]",
  },
  in_progress: {
    label: "In Bearbeitung",
    icon: Clock3,
    styles: "bg-[#e9e2d8] text-navy",
  },
  completed: {
    label: "Abgeschlossen",
    icon: Check,
    styles: "bg-success/10 text-success",
  },
} as const;

export function LessonStatus({
  status,
  compact = false,
}: {
  status: LessonUiStatus;
  compact?: boolean;
}) {
  const config = lessonStatusConfig[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold whitespace-nowrap",
        compact
          ? "size-7 justify-center"
          : "gap-1.5 px-2.5 py-1 text-[0.68rem]",
        config.styles,
      )}
      title={compact ? config.label : undefined}
    >
      <Icon
        aria-hidden="true"
        className={compact ? "size-3.5" : "size-3"}
        strokeWidth={2.1}
      />
      {compact ? <span className="sr-only">{config.label}</span> : config.label}
    </span>
  );
}

export function DataNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-[#dbbf93] bg-[#fffaf2] p-4 text-sm leading-6 text-[#654d2d]"
      role="status"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

export function AdminPreviewNotice() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-[#c5a875] bg-[#f4eee6] p-4 text-sm leading-6 text-navy"
      role="status"
    >
      <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
      <p>
        <strong>Admin-Vorschau:</strong> Alle veröffentlichten Lektionen sind
        geöffnet. Videofortschritt wird nicht gespeichert und Wissenstests sind
        deaktiviert.
      </p>
    </div>
  );
}
