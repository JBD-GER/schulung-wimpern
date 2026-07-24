import type { Metadata } from "next";
import { AlertCircle, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { PriceDisplay } from "@/components/marketing/price-display";
import { Logo } from "@/components/ui/logo";
import { COURSE_ACCESS_LABEL } from "@/data/access-policy";
import { COURSE } from "@/data/course";
import { optionalEnv } from "@/lib/env";
import { getPublicProduct } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schulungsplatz buchen",
  description:
    "Buche deinen Zugang zur Online-Schulung sicher mit Stripe. Das Teilnehmerkonto wird erst nach bestätigter Zahlung erstellt.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; resume?: string }>;
}) {
  const product = await getPublicProduct();
  const consentVersion = optionalEnv("CHECKOUT_CONSENT_VERSION") ?? "";
  const query = await searchParams;
  const paymentState = query.payment;
  const resumePayment =
    paymentState === "cancelled" && query.resume === "payment";
  const paymentMessage = resumePayment
    ? "Die externe Zahlung wurde abgebrochen. Du kannst dieselbe Zahlung erneut versuchen oder eine andere Zahlungsmethode auswählen."
    : paymentState === "cancelled"
      ? "Der Checkout wurde beendet. Es wurde kein neues Teilnehmerkonto, keine Bestellung und kein Kurszugang angelegt."
      : paymentState === "expired"
        ? "Die Zahlungssitzung ist abgelaufen. Es wurde kein neues Teilnehmerkonto, keine Bestellung und kein Kurszugang angelegt. Du kannst die Buchung neu beginnen."
        : paymentState === "failed"
          ? "Die Zahlung wurde nicht bestätigt. Es wurde kein neues Teilnehmerkonto, keine Bestellung und kein Kurszugang angelegt."
          : null;
  return (
    <main className="min-h-dvh bg-ivory">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
          <Logo />
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/widerruf#vertrag-widerrufen"
              className="text-xs font-bold text-navy underline decoration-gold underline-offset-4"
            >
              Vertrag widerrufen
            </Link>
            <span className="hidden items-center gap-2 text-xs font-bold text-muted sm:flex">
              <LockKeyhole className="size-4 text-success" aria-hidden="true" />
              Sicherer Checkout
            </span>
          </div>
        </div>
      </header>
      <div className="mx-auto grid min-w-0 max-w-[1180px] gap-10 px-5 py-9 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1.15fr)_380px] lg:gap-14">
        <section
          className="min-w-0 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-9"
          aria-labelledby="checkout-title"
        >
          <p className="text-xs font-extrabold tracking-[0.16em] text-gold uppercase">
            Einmalzahlung · kein Abonnement
          </p>
          <h1
            id="checkout-title"
            className="mt-3 font-serif text-3xl font-semibold tracking-[-0.03em] text-navy sm:text-4xl"
          >
            Deinen Schulungsplatz buchen
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Vor der Zahlung wird kein Teilnehmerkonto angelegt. Erst nach
            bestätigter Zahlung erstellen wir deinen Zugang und führen dich ohne
            zusätzliche Anmeldung direkt in deinen Lernbereich.
          </p>
          {paymentMessage ? (
            <div
              className="mt-5 flex gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm leading-6 text-navy"
              role="status"
            >
              <AlertCircle
                className="mt-0.5 size-5 shrink-0 text-gold"
                aria-hidden="true"
              />
              <p>{paymentMessage}</p>
            </div>
          ) : null}
          <div className="mt-8">
            <CheckoutFlow
              product={product}
              publishableKey={
                process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
              }
              consentVersion={consentVersion}
              resumePayment={resumePayment}
            />
          </div>
        </section>
        <aside className="min-w-0 lg:pt-6">
          <div className="sticky top-6 rounded-3xl bg-navy p-7 text-white shadow-soft">
            <p className="text-xs font-bold tracking-[0.15em] text-[#d9bd8f] uppercase">
              Deine Online-Schulung
            </p>
            <h2 className="mt-3 font-serif text-2xl leading-tight font-semibold">
              {product.name || COURSE.productName}
            </h2>
            <div className="mt-6 border-y border-white/10 py-5">
              <PriceDisplay product={product} inverse />
            </div>
            <ul className="mt-7 space-y-4 text-sm text-white/75">
              {[
                "Sieben strukturierte Lektionen",
                "Wissenstest nach jeder Lektion",
                "Gespeicherter Lernfortschritt",
                "Persönliches Abschlusszertifikat",
                COURSE_ACCESS_LABEL,
                "Bezahlte Rechnung im Portal",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#d9bd8f]/15 text-[#d9bd8f]">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck
                  className="size-5 text-[#d9bd8f]"
                  aria-hidden="true"
                />
                Geschützte Zahlungsabwicklung
              </p>
              <p className="mt-2 text-xs leading-5 text-white/55">
                Stripe verarbeitet deine Zahlungsdaten direkt. Sie werden weder
                durch unseren Server geleitet noch in unserer Datenbank
                gespeichert.
              </p>
            </div>
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-muted">
            Fragen zur Buchung?{" "}
            <Link
              href="/kontakt"
              className="font-bold text-navy underline decoration-gold underline-offset-4"
            >
              Support kontaktieren
            </Link>
          </p>
        </aside>
      </div>
    </main>
  );
}
