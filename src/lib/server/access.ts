import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { HttpError } from "./http";

export interface ActiveEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: "active" | "completed";
}

export async function requireEnrollment(
  userId: string,
  courseId?: string,
): Promise<ActiveEnrollment> {
  let query = getSupabaseAdmin()
    .from("enrollments")
    .select("id,user_id,course_id,status")
    .eq("user_id", userId)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (courseId) query = query.eq("course_id", courseId);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new HttpError(
      503,
      "Der Kurszugang kann gerade nicht geprüft werden.",
      "access_check_failed",
    );
  if (!data)
    throw new HttpError(
      403,
      "Für diesen Kurs besteht kein aktiver Zugang.",
      "enrollment_required",
    );
  return data as ActiveEnrollment;
}

export async function assertLessonUnlocked(
  userId: string,
  lessonId: string,
): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("lesson_is_unlocked", {
    check_user_id: userId,
    check_lesson_id: lessonId,
  });
  if (error)
    throw new HttpError(
      503,
      "Der Lektionszugang kann gerade nicht geprüft werden.",
      "access_check_failed",
    );
  if (data !== true)
    throw new HttpError(
      403,
      "Diese Lektion ist noch gesperrt.",
      "lesson_locked",
    );
}
