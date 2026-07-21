import { PageIntro } from "@/components/dashboard/ui";
import { loadProfile } from "@/components/dashboard/data";
import {
  ProfileWorkspace,
  type SectionId,
} from "@/components/profile/profile-workspace";

const sectionByQuery: Record<string, SectionId> = {
  persoenlich: "personal",
  rechnung: "billing",
  sicherheit: "security",
  bestellungen: "orders",
  datenschutz: "privacy",
  abmelden: "logout",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ bereich?: string | string[] }>;
}) {
  const data = await loadProfile();
  const query = (await searchParams).bereich;
  const queryValue = Array.isArray(query) ? query[0] : query;
  const initialSection = queryValue
    ? (sectionByQuery[queryValue] ?? "personal")
    : "personal";

  return (
    <div className="mx-auto max-w-6xl">
      <PageIntro
        eyebrow="Mein Konto"
        title="Profil"
        description="Verwalte deine persönlichen Daten, Rechnungsangaben und Sicherheitseinstellungen."
      />
      <ProfileWorkspace data={data} initialSection={initialSection} />
    </div>
  );
}
