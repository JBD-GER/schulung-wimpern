import type { Metadata } from "next";
import { CookieSettings } from "@/components/privacy/cookie-settings";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Cookie-Einstellungen",
  description:
    "Cookie- und Datenschutzeinstellungen für notwendige Funktionen und anonyme Webstatistik.",
  alternates: { canonical: "/cookie-einstellungen" },
};
export default function CookieSettingsPage() {
  return (
    <main className="min-h-dvh bg-ivory">
      <header className="border-b border-line bg-white">
        <Container className="py-4">
          <Logo />
        </Container>
      </header>
      <Container className="max-w-3xl py-14 sm:py-20">
        <p className="text-xs font-extrabold tracking-[0.16em] text-gold uppercase">
          Datenschutz
        </p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.035em] text-navy sm:text-5xl">
          Cookie-Einstellungen
        </h1>
        <p className="mt-5 leading-7 text-muted">
          Hier siehst du die eingesetzten Kategorien, kannst deine Einwilligung
          jederzeit ändern oder anonyme Statistik für die Zukunft widerrufen.
        </p>
        <div className="mt-9">
          <CookieSettings />
        </div>
      </Container>
    </main>
  );
}
