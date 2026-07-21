import { AlertCircle, Inbox } from "lucide-react";

export function AdminError({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/[.045] p-4 text-sm leading-6 text-danger"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-1 size-4 shrink-0" />
      {message}
    </div>
  );
}

export function AdminEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <Inbox aria-hidden="true" className="mx-auto size-8 text-muted/50" />
      <h3 className="mt-4 font-bold text-navy">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
        {description}
      </p>
    </div>
  );
}

export function AdminLoading({
  label = "Daten werden geladen …",
}: {
  label?: string;
}) {
  return (
    <div className="animate-pulse space-y-3" role="status" aria-label={label}>
      <div className="h-12 rounded-xl bg-ivory" />
      <div className="h-12 rounded-xl bg-ivory/80" />
      <div className="h-12 rounded-xl bg-ivory/60" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
