import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ivory">
      <a
        href="#hauptinhalt"
        className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-navy px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0"
      >
        Zum Hauptinhalt
      </a>
      <SiteHeader />
      <main id="hauptinhalt">{children}</main>
      <SiteFooter />
    </div>
  );
}
