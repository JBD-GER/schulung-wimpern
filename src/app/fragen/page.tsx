import type { Metadata } from "next";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { FaqList } from "@/components/marketing/faq-list";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { FAQS } from "@/data/course";

const title = "Fragen zur Online-Schulung Wimpernverlängerung";
const description =
  "Antworten zu Kursinhalten, Zugang, Wissenstests, Zahlung und Abschlusszertifikat der Online-Schulung Wimpernverlängerung.";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/fragen" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "/fragen",
    title,
    description,
  },
};

export default function QuestionsPage() {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Startseite",
            item: siteUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Fragen",
            item: `${siteUrl}/fragen`,
          },
        ],
      },
    ],
  };

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="border-b border-line bg-white">
        <Container className="py-14 text-center sm:py-20">
          <nav
            className="mb-5 flex justify-center gap-2 text-xs font-semibold text-muted"
            aria-label="Brotkrümelnavigation"
          >
            <Link href="/" className="hover:text-navy">
              Startseite
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Fragen</span>
          </nav>
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-gold/10 text-gold">
            <MessageCircleQuestion
              className="size-6"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </span>
          <h1 className="mx-auto mt-5 max-w-4xl hyphens-auto font-serif text-4xl leading-tight font-semibold tracking-[-0.04em] text-navy sm:text-5xl lg:text-6xl">
            Fragen zur Online-Schulung Wimpernverlängerung
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
            Klare Antworten zu Lerninhalten, Ablauf, Wissenstests, Zugang,
            Zahlung und deinem persönlichen Abschlusszertifikat.
          </p>
        </Container>
      </section>

      <section className="py-14 sm:py-20">
        <Container>
          <FaqList items={FAQS} />
        </Container>
      </section>

      <section className="border-t border-line bg-white py-16">
        <Container className="flex flex-col gap-6 rounded-3xl bg-navy p-7 text-white sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold">
              Deine Frage ist noch offen?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
              Schreib uns dein Anliegen. So bekommst du eine Antwort, die zu
              deiner Buchung oder deinem Lernstand passt.
            </p>
          </div>
          <ButtonLink
            href="/kontakt"
            variant="gold"
            size="lg"
            className="shrink-0"
          >
            Kontakt aufnehmen
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </Container>
      </section>
    </MarketingShell>
  );
}
