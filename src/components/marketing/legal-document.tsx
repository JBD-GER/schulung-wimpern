import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import type { LegalProvider, LegalProviderDraft } from "@/lib/server/release";

export function LegalDocument({
  eyebrow,
  title,
  introduction,
  released = false,
  children,
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  released?: boolean;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <section className="border-b border-line bg-white">
        <Container className="py-14 sm:py-20">
          <p className="text-xs font-extrabold tracking-[0.18em] text-gold uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-4xl hyphens-auto font-serif text-4xl leading-tight font-semibold tracking-[-0.035em] text-navy sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted sm:text-lg">
            {introduction}
          </p>
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        {!released ? (
          <div className="mb-10 flex items-start gap-4 rounded-2xl border border-gold/35 bg-gold/8 p-5 text-sm leading-6 text-navy sm:p-6">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-gold"
              aria-hidden="true"
            />
            <div>
              <p className="font-extrabold">
                Technischer Entwurf – vor Veröffentlichung rechtlich prüfen
              </p>
              <p className="mt-1 text-muted">
                Dieser Text bildet die technische Struktur der Plattform ab.
                Anbieterangaben, eingesetzte Dienstleister, Vertragsmodell und
                rechtliche Formulierungen müssen vor dem Livegang vollständig
                ergänzt und qualifiziert geprüft werden.
              </p>
            </div>
          </div>
        ) : null}
        <article className="mx-auto max-w-4xl rounded-3xl border border-line bg-white p-6 shadow-card sm:p-10 lg:p-12">
          <div className="space-y-10 text-[0.98rem] leading-7 text-ink/80 [&_a]:font-semibold [&_a]:text-navy [&_a]:underline [&_a]:decoration-gold/60 [&_a]:underline-offset-2 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-navy [&_h3]:mt-5 [&_h3]:font-bold [&_h3]:text-navy [&_li]:pl-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p+p]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
            {children}
          </div>
        </article>
      </Container>
    </MarketingShell>
  );
}

export function PlaceholderBlock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-gold/60 bg-ivory px-4 py-3 font-mono text-sm leading-6 text-navy">
      {children}
    </div>
  );
}

export function CanonicalLegalText({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const headerLines = blocks.shift()?.split("\n") ?? [];

  return (
    <>
      {headerLines[0] ? (
        <span className="sr-only">{headerLines[0]}</span>
      ) : null}
      {headerLines.slice(1).length ? (
        <p className="text-sm font-semibold whitespace-pre-line text-muted">
          {headerLines.slice(1).join("\n")}
        </p>
      ) : null}
      {blocks.map((block, index) => {
        const [firstLine, ...remainingLines] = block.split("\n");
        const isHeading =
          /^\d+\.\s/.test(firstLine) ||
          (firstLine === firstLine.toUpperCase() && /[A-ZÄÖÜ]/.test(firstLine));
        return (
          <section key={`${index}-${firstLine}`}>
            {isHeading ? <h2>{firstLine}</h2> : null}
            <p
              className={
                isHeading ? "mt-3 whitespace-pre-line" : "whitespace-pre-line"
              }
            >
              {(isHeading
                ? remainingLines
                : [firstLine, ...remainingLines]
              ).join("\n")}
            </p>
          </section>
        );
      })}
    </>
  );
}

export function ProviderAddress({
  provider,
  showAddress = true,
  showContact = false,
}: {
  provider: LegalProvider | LegalProviderDraft;
  showAddress?: boolean;
  showContact?: boolean;
}) {
  const lines = showAddress
    ? [
        provider.companyName,
        provider.street,
        provider.postalCity,
        provider.country,
      ].filter((line): line is string => Boolean(line))
    : [];

  return (
    <address className="mt-4 not-italic">
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      {showContact && provider.email ? (
        <span className="mt-3 block">
          E-Mail: <a href={`mailto:${provider.email}`}>{provider.email}</a>
        </span>
      ) : null}
      {showContact && provider.phone ? (
        <span className="block">
          Telefon:{" "}
          <a href={`tel:${provider.phone.replace(/[^+\d]/g, "")}`}>
            {provider.phone}
          </a>
        </span>
      ) : null}
    </address>
  );
}
