import { EmailLog } from "@/components/admin/email-log";
import { PageIntro } from "@/components/dashboard/ui";

export default function AdminEmailsPage() {
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
