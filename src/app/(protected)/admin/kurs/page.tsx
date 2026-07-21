import { CourseManager } from "@/components/admin/course-manager";
import { PageIntro } from "@/components/dashboard/ui";

export default function AdminCoursePage() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageIntro
        eyebrow="Administration"
        title="Kurs & Lektionen"
        description="Verwalte Kursdaten, Laufzeiten und private Stream-Zuordnungen in einem protokollierten Workflow. Reihenfolge und Slugs bleiben unveränderlich."
      />
      <CourseManager />
    </div>
  );
}
