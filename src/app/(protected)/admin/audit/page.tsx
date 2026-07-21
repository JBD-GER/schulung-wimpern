import { AuditLog } from "@/components/admin/audit-log";
import { guardAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminAuditPage() {
  await guardAdmin();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="Audit Log"
        description="Nachvollziehbare Historie kritischer Verwaltungsaktionen – serverseitig geladen und nur für Admins sichtbar."
      />
      <AuditLog />
    </div>
  );
}
