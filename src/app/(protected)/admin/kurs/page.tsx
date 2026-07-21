import { CourseManager } from "@/components/admin/course-manager";
import { guardAdmin } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";

export default async function AdminCoursePage() {
  await guardAdmin();

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
