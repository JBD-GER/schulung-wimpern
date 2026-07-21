"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpen,
  LayoutDashboard,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const participantNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Schulung", href: "/schulung", icon: BookOpen },
  { label: "Zertifikat", href: "/zertifikat", icon: Award },
  { label: "Profil", href: "/profil", icon: UserRound },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Teilnehmerbereich" className="space-y-1.5">
      {participantNavigation.map((item) => {
        const active = isCurrent(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-sm font-bold transition-colors",
              active
                ? "bg-navy text-white shadow-[0_8px_22px_rgba(29,39,51,.16)]"
                : "text-navy hover:bg-navy/5",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "size-[1.15rem]",
                active ? "text-[#dfc79f]" : "text-muted",
              )}
              strokeWidth={1.8}
            />
            {item.label}
          </Link>
        );
      })}

      {isAdmin ? (
        <div className="pt-5">
          <p className="mb-2 px-3.5 text-[0.65rem] font-extrabold tracking-[0.16em] text-muted uppercase">
            Verwaltung
          </p>
          <Link
            href="/admin"
            aria-current={isCurrent(pathname, "/admin") ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-sm font-bold transition-colors",
              isCurrent(pathname, "/admin")
                ? "bg-navy text-white"
                : "text-navy hover:bg-navy/5",
            )}
          >
            <ShieldCheck
              aria-hidden="true"
              className="size-[1.15rem] text-gold"
              strokeWidth={1.8}
            />
            Administration
          </Link>
        </div>
      ) : null}
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile Teilnehmernavigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(29,39,51,.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {participantNavigation.map((item) => {
          const active = isCurrent(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.68rem] font-bold transition-colors",
                active ? "text-navy" : "text-muted hover:text-navy",
              )}
            >
              {active ? (
                <span
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gold"
                  aria-hidden="true"
                />
              ) : null}
              <Icon
                aria-hidden="true"
                className="size-5"
                strokeWidth={active ? 2.2 : 1.7}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
