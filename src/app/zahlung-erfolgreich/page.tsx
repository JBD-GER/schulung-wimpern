import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Zahlung bestätigen",
  robots: { index: false, follow: false },
};

export default function PaymentSuccessPage() {
  return (
    <main className="min-h-dvh bg-ivory">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-[1100px] px-5 py-4">
          <Logo />
        </div>
      </header>
      <section className="mx-auto flex min-h-[calc(100dvh-74px)] max-w-3xl items-center justify-center px-5 py-16">
        <div className="w-full rounded-3xl border border-line bg-white p-7 shadow-soft sm:p-12">
          <Suspense
            fallback={
              <div className="h-64 animate-pulse rounded-2xl bg-beige/35" />
            }
          >
            <PaymentStatus />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
