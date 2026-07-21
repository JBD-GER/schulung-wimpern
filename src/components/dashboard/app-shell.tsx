import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import type { ShellData } from "@/components/dashboard/data";
import {
  DesktopNavigation,
  MobileNavigation,
} from "@/components/dashboard/protected-nav";

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellData;
}) {
  return (
    <div className="min-h-dvh bg-ivory">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-line bg-white lg:flex lg:flex-col">
        <div className="flex h-24 items-center border-b border-line px-7">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-8">
          <DesktopNavigation isAdmin={user.isAdmin} />
        </div>
        <div className="border-t border-line p-5">
          <Link
            href="/profil"
            className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-ivory"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy font-serif text-sm font-bold text-white">
              {user.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-navy">
                {user.firstName ?? "Mein Konto"}
              </span>
              <span className="block truncate text-xs text-muted">
                {user.email ?? "Profildaten ansehen"}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 text-muted transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/widerruf#vertrag-widerrufen"
            className="mt-3 block rounded-lg border border-gold/35 bg-gold/8 px-3 py-2 text-center text-xs font-extrabold text-navy transition-colors hover:bg-gold/15"
          >
            Vertrag widerrufen
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
          <Logo compact />
          <div className="flex items-center gap-2">
            {user.isAdmin ? (
              <Link
                href="/admin"
                className="grid size-10 place-items-center rounded-full border border-gold/40 bg-ivory text-navy"
                aria-label="Administration öffnen"
              >
                <ShieldCheck aria-hidden="true" className="size-5" />
              </Link>
            ) : null}
            <Link
              href="/profil"
              className="grid size-10 place-items-center rounded-full bg-navy font-serif text-xs font-bold text-white"
              aria-label="Profil öffnen"
            >
              {user.initials}
            </Link>
          </div>
        </header>
        <main
          id="hauptinhalt"
          className="mx-auto min-h-dvh w-full max-w-[1480px] px-4 py-7 pb-28 sm:px-7 sm:py-10 lg:px-10 lg:py-12 lg:pb-12 xl:px-14"
        >
          {children}
        </main>
        <footer className="px-4 pb-28 text-center sm:px-7 lg:px-10 lg:pb-8">
          <Link
            href="/widerruf#vertrag-widerrufen"
            className="text-xs font-bold text-muted underline decoration-gold underline-offset-4"
          >
            Vertrag widerrufen
          </Link>
        </footer>
      </div>
      <MobileNavigation />
    </div>
  );
}
