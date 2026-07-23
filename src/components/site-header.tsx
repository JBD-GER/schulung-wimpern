"use client";

import { LayoutDashboard, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

const navigation = [
  { label: "Schulung", href: "/#schulung" },
  { label: "Inhalte", href: "/#inhalte" },
  { label: "Ablauf", href: "/#ablauf" },
  { label: "Zertifikat", href: "/#zertifikat" },
  { label: "Fragen", href: "/fragen" },
  { label: "Kontakt", href: "/kontakt" },
] as const;

export function SiteHeader() {
  const [authenticated, setAuthenticated] = useState(false);
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json().catch(() => ({}))) as {
          authenticated?: boolean;
        };
        if (active) setAuthenticated(data.authenticated === true);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const accountHref = authenticated ? "/dashboard" : "/login";
  const accountLabel = authenticated ? "Dashboard" : "Login";
  const AccountIcon = authenticated ? LayoutDashboard : UserRound;
  const closeMobileMenu = () => {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-ivory/95 backdrop-blur-lg">
      <Container className="flex min-h-[4.5rem] items-center justify-between gap-3 py-2">
        <div className="sm:hidden">
          <Logo compact />
        </div>
        <div className="hidden sm:block">
          <Logo />
        </div>

        <nav
          className="hidden items-center gap-5 xl:flex"
          aria-label="Hauptnavigation"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-bold text-navy/75 transition-colors hover:text-navy"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink
            href={accountHref}
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
          >
            <AccountIcon className="size-4" aria-hidden="true" />
            {accountLabel}
          </ButtonLink>
          <ButtonLink href="/checkout" size="sm" className="px-3 sm:px-4">
            <span className="sm:hidden">Buchen</span>
            <span className="hidden sm:inline">Schulungsplatz buchen</span>
          </ButtonLink>

          <details ref={mobileMenuRef} className="group relative xl:hidden">
            <summary
              className="grid size-10 cursor-pointer list-none place-items-center rounded-xl border border-line bg-white text-navy transition-colors hover:bg-beige/40 marker:content-none [&::-webkit-details-marker]:hidden"
              aria-label="Menü öffnen"
            >
              <Menu className="size-5" aria-hidden="true" />
            </summary>
            <div className="absolute top-[calc(100%+0.7rem)] right-0 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-3 shadow-[0_24px_70px_rgba(29,39,51,0.18)]">
              <nav className="grid" aria-label="Mobile Navigation">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className="rounded-xl px-4 py-3 text-sm font-bold text-navy hover:bg-ivory"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href={accountHref}
                  onClick={closeMobileMenu}
                  className="mt-1 flex items-center gap-2 border-t border-line px-4 pt-4 pb-3 text-sm font-bold text-navy"
                >
                  <AccountIcon className="size-4" aria-hidden="true" />
                  {authenticated ? "Dashboard" : "Teilnehmer-Login"}
                </Link>
              </nav>
            </div>
          </details>
        </div>
      </Container>
    </header>
  );
}
