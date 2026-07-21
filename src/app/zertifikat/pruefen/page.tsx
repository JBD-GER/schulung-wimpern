import type { Metadata } from "next";
import { Suspense } from "react";
import { VerificationForm } from "@/components/certificate/verification-form";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Zertifikat prüfen",
  description:
    "Prüfe die Gültigkeit eines Abschlusszertifikats anhand seiner Zertifikatsnummer.",
  robots: { index: false, follow: false },
};
export default function VerifyCertificatePage() {
  return (
    <main className="min-h-dvh bg-ivory">
      <header className="border-b border-line bg-white">
        <Container className="py-4">
          <Logo />
        </Container>
      </header>
      <Container className="max-w-3xl py-14 sm:py-20">
        <p className="text-xs font-extrabold tracking-[0.16em] text-gold uppercase">
          Datensparsame Verifikation
        </p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-[-0.035em] text-navy sm:text-5xl">
          Abschlusszertifikat prüfen
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-muted">
          Gib die Zertifikatsnummer ein. Aus Datenschutzgründen zeigen wir keine
          E-Mail-Adresse, Anschrift oder Quizdaten an.
        </p>
        <div className="mt-9">
          <Suspense
            fallback={
              <div className="h-52 animate-pulse rounded-2xl bg-beige/40" />
            }
          >
            <VerificationForm />
          </Suspense>
        </div>
      </Container>
    </main>
  );
}
