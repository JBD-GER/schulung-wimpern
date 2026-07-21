import { ParticipantsManager } from "@/components/admin/participants-manager";
import { guardAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminParticipantsPage() {
  await guardAdmin();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="Teilnehmerinnen"
        description="Prüfe Profile, Zahlungen, Kurszugänge, Lernfortschritt, Quizversuche und Zertifikate und bestätige kritische Änderungen ausdrücklich."
      />
      <ParticipantsManager />
    </div>
  );
}
