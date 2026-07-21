import { NextResponse } from "next/server";

import { optionalEnv } from "@/lib/env";
import {
  assertLessonUnlocked,
  enrollmentHasDurableCompletion,
  requireEnrollment,
} from "@/lib/server/access";
import { isAdminUser, requireUser } from "@/lib/server/auth";
import { HttpError, jsonError } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ materialId: string }> },
) {
  try {
    const user = await requireUser();
    const { materialId } = await context.params;
    const admin = getSupabaseAdmin();
    const { data: material, error: materialError } = await admin
      .from("lesson_materials")
      .select("id,lesson_id,file_key,status")
      .eq("id", materialId)
      .eq("status", "published")
      .maybeSingle();
    if (materialError)
      throw new HttpError(
        503,
        "Das Begleitmaterial kann gerade nicht geprüft werden.",
      );
    if (!material)
      throw new HttpError(
        404,
        "Das Begleitmaterial wurde nicht gefunden.",
        "not_found",
      );
    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .select("course_id")
      .eq("id", material.lesson_id)
      .single();
    if (lessonError)
      throw new HttpError(
        503,
        "Die Materiallektion kann gerade nicht geprüft werden.",
      );
    if (!lesson)
      throw new HttpError(
        404,
        "Die Lektion wurde nicht gefunden.",
        "not_found",
      );
    const enrollment = await requireEnrollment(user.id, lesson.course_id);
    if (
      !enrollmentHasDurableCompletion(enrollment) &&
      !(await isAdminUser(user))
    ) {
      await assertLessonUnlocked(user.id, material.lesson_id);
    }
    const { data, error } = await admin.storage
      .from(optionalEnv("COURSE_MATERIALS_BUCKET") ?? "course-materials")
      .createSignedUrl(material.file_key, 60, { download: true });
    if (error || !data?.signedUrl)
      throw new HttpError(
        503,
        "Das Material kann gerade nicht geladen werden.",
      );
    return NextResponse.redirect(data.signedUrl, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
