import { EmailLog } from "@/components/admin/email-log";
import { guardAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminEmailsPage() {
  await guardAdmin();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="E-Mail-Protokoll"
        description="Prüfe Transaktionsvorlagen, Provider-Referenzen und bestätigte Fehler und stoße fehlgeschlagene Sendungen kontrolliert erneut an."
      />
      <EmailLog />
    </div>
  );
}
