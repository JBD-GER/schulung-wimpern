import type { Metadata } from "next";
import { AppShell } from "@/components/dashboard/app-shell";
import { loadShellData } from "@/components/dashboard/data";

export const metadata: Metadata = {
  title: "Lernbereich",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await loadShellData();

  return (
    <>
      <a
        href="#hauptinhalt"
        className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0"
      >
        Zum Hauptinhalt
      </a>
      <AppShell user={user}>{children}</AppShell>
    </>
  );
}
