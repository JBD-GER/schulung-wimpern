"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpenCheck,
  FileClock,
  HelpCircle,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Übersicht", icon: LayoutDashboard },
  { href: "/admin/teilnehmer", label: "Teilnehmerinnen", icon: UsersRound },
  { href: "/admin/kurs", label: "Kurs", icon: BookOpenCheck },
  { href: "/admin/quiz", label: "Quiz", icon: HelpCircle },
  { href: "/admin/zertifikate", label: "Zertifikate", icon: Award },
  { href: "/admin/e-mails", label: "E-Mails", icon: Mail },
  { href: "/admin/datenschutz", label: "Datenschutz", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit Log", icon: FileClock },
];

export function AdminSectionNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Administrationsbereiche"
      className="mb-7 overflow-x-auto rounded-2xl border border-line bg-white p-2 shadow-[0_8px_24px_rgba(29,39,51,.045)]"
    >
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-colors",
                active
                  ? "bg-navy text-white"
                  : "text-muted hover:bg-ivory hover:text-navy",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4",
                  active ? "text-[#dfc79f]" : "text-muted",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
