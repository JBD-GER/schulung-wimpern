import type { Metadata } from "next";
import { Clock3, Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Container } from "@/components/ui/container";

const title = "Kontakt zur Schulung Wimpernverlängerung";
const description =
  "Kontakt bei Fragen zur Online-Schulung Wimpernverlängerung, Buchung, Zahlung, Zugang oder Abschlusszertifikat.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/kontakt" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "/kontakt",
    title,
    description,
  },
};

export default function ContactPage() {
  const supportEmail = process.env.SUPPORT_EMAIL;

  return (
    <MarketingShell>
      <section className="border-b border-line bg-white">
        <Container className="py-14 sm:py-20">
          <nav
            className="mb-5 flex gap-2 text-xs font-semibold text-muted"
            aria-label="Brotkrümelnavigation"
          >
            <Link href="/" className="hover:text-navy">
              Startseite
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Kontakt</span>
          </nav>
          <p className="text-xs font-extrabold tracking-[0.18em] text-gold uppercase">
            Wir helfen dir weiter
          </p>
          <h1 className="mt-4 max-w-4xl hyphens-auto font-serif text-4xl leading-tight font-semibold tracking-[-0.04em] text-navy sm:text-5xl lg:text-6xl">
            Kontakt zur Schulung Wimpernverlängerung
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
            Du hast eine Frage zur Schulung, zur Buchung oder zu deinem Zugang?
            Sende uns dein Anliegen über das Formular.
          </p>
        </Container>
      </section>

      <section className="py-14 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:gap-14">
          <aside className="space-y-4 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="grid size-10 place-items-center rounded-xl bg-gold/10 text-gold">
                <MessageSquareText className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-5 font-serif text-2xl font-semibold text-navy">
                Der passende Kontaktweg
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Wähle im Formular das Thema deiner Anfrage. Wir verwenden deine
                Angaben ausschließlich, um dein Anliegen zu bearbeiten.
              </p>
            </div>
            {supportEmail ? (
              <div className="rounded-2xl border border-line bg-white p-6">
                <div className="flex items-center gap-3 text-sm font-bold text-navy">
                  <Mail className="size-4 text-gold" aria-hidden="true" />
                  E-Mail
                </div>
                <a
                  href={`mailto:${supportEmail}`}
                  className="mt-3 block break-all text-sm font-semibold text-navy underline decoration-gold/60 underline-offset-2"
                >
                  {supportEmail}
                </a>
              </div>
            ) : null}
            <div className="rounded-2xl border border-line bg-ivory p-5 text-sm leading-6 text-muted">
              <p className="flex items-center gap-2 font-bold text-navy">
                <Clock3 className="size-4 text-gold" aria-hidden="true" />
                Gut zu wissen
              </p>
              <p className="mt-2">
                Beschreibe dein Anliegen möglichst konkret, aber sende keine
                Passwörter, Zahlungsdaten oder anderen sensiblen Zugangsdaten.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-success/8 p-5 text-sm leading-6 text-muted">
              <ShieldCheck
                className="mt-0.5 size-5 shrink-0 text-success"
                aria-hidden="true"
              />
              <p>
                Deine Nachricht wird serverseitig geprüft und nur zur
                Bearbeitung deiner Anfrage verwendet.
              </p>
            </div>
          </aside>
          <ContactForm />
        </Container>
      </section>
    </MarketingShell>
  );
}
