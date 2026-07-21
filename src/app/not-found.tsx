import { ArrowLeft, BookOpen, MessageCircleQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ivory px-5 py-12">
      <div className="w-full max-w-2xl rounded-3xl border border-line bg-white p-8 text-center shadow-soft sm:p-12">
        <Logo className="justify-center" />
        <p className="mt-10 text-xs font-extrabold tracking-[0.18em] text-gold uppercase">
          Fehler 404
        </p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.035em] text-navy">
          Diese Seite ist nicht mehr hier
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-muted">
          Vielleicht wurde der Inhalt verschoben oder der Link ist nicht
          vollständig. Über diese Wege kommst du sicher weiter.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/">
            <ArrowLeft className="size-5" aria-hidden="true" />
            Zur Startseite
          </ButtonLink>
          <ButtonLink href="/#inhalte" variant="secondary">
            <BookOpen className="size-5" aria-hidden="true" />
            Kursinhalte
          </ButtonLink>
          <ButtonLink href="/kontakt" variant="ghost">
            <MessageCircleQuestion className="size-5" aria-hidden="true" />
            Hilfe
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
