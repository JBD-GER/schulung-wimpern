import { QuizManager } from "@/components/admin/quiz-manager";
import { PageIntro } from "@/components/dashboard/ui";

export default function AdminQuizPage() {
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
