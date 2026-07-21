import { ArrowUpRight, Mail } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

const footerLinks = [
  { label: "Schulung", href: "/#inhalte" },
  { label: "Häufige Fragen", href: "/fragen" },
  { label: "Kontakt", href: "/kontakt" },
  { label: "Teilnehmer-Login", href: "/login" },
] as const;

const legalLinks: ReadonlyArray<{
  label: string;
  href: string;
  prominent?: boolean;
}> = [
  {
    label: "Vertrag widerrufen",
    href: "/widerruf#vertrag-widerrufen",
    prominent: true,
  },
  { label: "Impressum", href: "/impressum" },
  { label: "Datenschutz", href: "/datenschutz" },
  { label: "AGB", href: "/agb" },
  { label: "Cookie-Einstellungen", href: "/cookie-einstellungen" },
];

export function SiteFooter() {
  const supportEmail = process.env.SUPPORT_EMAIL;

  return (
    <footer className="border-t border-white/10 bg-navy text-white">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.45fr_0.7fr_0.9fr]">
          <div className="max-w-md">
            <Logo inverse />
            <p className="mt-6 text-sm leading-7 text-white/62">
              Eine strukturierte Online-Schulung für die professionelle
              1:1-Wimpernverlängerung – mit sieben Lektionen, Wissenstests und
              persönlichem Abschlusszertifikat.
            </p>
          </div>

          <div>
            <p className="text-xs font-extrabold tracking-[0.16em] text-gold uppercase">
              Orientierung
            </p>
            <nav className="mt-5 grid gap-3" aria-label="Footer-Navigation">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="w-fit text-sm font-semibold text-white/72 transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <p className="text-xs font-extrabold tracking-[0.16em] text-gold uppercase">
              Kontakt
            </p>
            <p className="mt-5 text-sm leading-6 text-white/62">
              Fragen zur Schulung, Buchung oder Lernplattform? Schreib uns über
              den sicheren Kontaktweg.
            </p>
            {supportEmail ? (
              <a
                href={`mailto:${supportEmail}`}
                className="mt-4 flex w-fit items-center gap-2 text-sm font-bold text-white hover:text-gold"
              >
                <Mail className="size-4" aria-hidden="true" />
                {supportEmail}
              </a>
            ) : (
              <Link
                href="/kontakt"
                className="mt-4 flex w-fit items-center gap-2 text-sm font-bold text-white hover:text-gold"
              >
                Zum Kontaktformular
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-white/10 pt-7 text-xs text-white/45 lg:flex-row lg:items-center lg:justify-between">
          <p>© {new Date().getFullYear()} Schulung Wimpernverlängerung</p>
          <nav
            className="flex flex-wrap gap-x-5 gap-y-3"
            aria-label="Rechtliche Hinweise"
          >
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  link.prominent
                    ? "rounded-lg border border-gold/70 bg-gold/10 px-3 py-2 font-extrabold text-white transition-colors hover:bg-gold hover:text-navy"
                    : "py-2 transition-colors hover:text-white"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </Container>
    </footer>
  );
}
