import { DataRequestQueue } from "@/components/admin/data-request-queue";
import { guardAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminDataRequestsPage() {
  await guardAdmin();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="Datenschutzanfragen"
        description="Sichte gespeicherte Auskunfts-, Berichtigungs- und Löschanfragen und dokumentiere ihren Bearbeitungsstatus."
      />
      <DataRequestQueue />
    </div>
  );
}
