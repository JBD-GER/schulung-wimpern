import { QuizManager } from "@/components/admin/quiz-manager";
import { guardAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminQuizPage() {
  await guardAdmin();

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="Quizverwaltung"
        description="Bearbeite fünf Fragen je Lektion, exakt vier Optionen und den serverseitigen Lösungsschlüssel. Freigaben werden validiert und protokolliert."
      />
      <QuizManager />
    </div>
  );
}
