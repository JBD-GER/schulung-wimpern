import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh bg-ivory lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 10%, #b08d57 0, transparent 27%), radial-gradient(circle at 90% 90%, #e8ded2 0, transparent 22%)",
          }}
        />
        <Logo inverse className="relative" />
        <div className="relative max-w-xl py-20">
          <p className="mb-5 text-xs font-bold tracking-[0.18em] text-[#d9bd8f] uppercase">
            Dein geschützter Lernbereich
          </p>
          <p className="font-serif text-4xl leading-tight font-semibold">
            Professionelle 1:1-Technik. Klar aufgebaut. Flexibel gelernt.
          </p>
          <div className="mt-9 flex items-center gap-3 text-sm text-white/75">
            <ShieldCheck className="size-5 text-[#d9bd8f]" aria-hidden="true" />
            Persönlicher Login und geschützte Kursinhalte
          </div>
        </div>
        <p className="relative text-xs text-white/50">
          Schulung Wimpernverlängerung
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Logo className="mb-12 lg:hidden" />
          <p className="text-xs font-extrabold tracking-[0.16em] text-gold uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight font-semibold tracking-[-0.035em] text-navy">
            {title}
          </h1>
          <p className="mt-4 leading-7 text-muted">{description}</p>
          <div className="mt-9">{children}</div>
        </div>
      </section>
    </main>
  );
}
