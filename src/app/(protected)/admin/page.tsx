import { ShieldCheck } from "lucide-react";
import { AdminOverview } from "@/components/admin/admin-overview";
import { loadAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminPage() {
  const data = await loadAdmin();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Rollenbasiert geschützt"
        title="Administration"
        description="Kontrollzentrum für bestätigte Plattform-, Kurs- und Transaktionsdaten. Kritische Aktionen gehören in protokollierte, erneut bestätigte Workflows."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/[.07] px-3 py-2 text-xs font-bold text-success">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Admin-Zugriff bestätigt
          </span>
        }
      />
      <AdminOverview data={data} />
    </div>
  );
}
