import { CertificateManager } from "@/components/admin/certificate-manager";
import { CertificateReviewQueue } from "@/components/admin/certificate-review-queue";
import { PageIntro } from "@/components/dashboard/ui";

export default function AdminCertificatesPage() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="Zertifikate"
        description="Prüfe Gültigkeit und Versandstatus, lade private PDFs herunter und bestätige Widerruf oder erneuten Versand. Ausgestellte Zertifikatsinhalte bleiben unveränderlich."
      />
      <CertificateReviewQueue />
      <CertificateManager />
    </div>
  );
}
