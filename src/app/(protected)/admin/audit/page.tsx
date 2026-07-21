import { AuditLog } from "@/components/admin/audit-log";
import { PageIntro } from "@/components/dashboard/ui";

export default function AdminAuditPage() {
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
