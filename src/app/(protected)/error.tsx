"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";

export default function ProtectedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto grid min-h-[65dvh] max-w-2xl place-items-center py-12 text-center">
      <div className="rounded-2xl border border-line bg-white p-7 shadow-card sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-danger/[.07] text-danger">
          <AlertCircle aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-6 text-xs font-extrabold tracking-[0.15em] text-gold uppercase">
          Geschützter Bereich
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-navy">
          Der Inhalt konnte nicht geladen werden
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Deine Daten wurden nicht verändert. Versuche es erneut oder kehre zum
          Dashboard zurück.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Erneut versuchen
          </Button>
          <Link
            href="/dashboard"
            className={buttonStyles({ variant: "secondary" })}
          >
            Zum Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
