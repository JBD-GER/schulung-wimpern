import { assertLessonUnlocked, requireEnrollment } from "@/lib/server/access";
import { isAdminUser, requireUser } from "@/lib/server/auth";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { progressSchema } from "@/lib/validation/learning";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = progressSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "video-progress",
      subject: user.id,
      maximum: 180,
      windowSeconds: 3600,
    });
    const admin = getSupabaseAdmin();
    const { data: lesson, error } = await admin
      .from("lessons")
      .select("id,course_id,duration_seconds,status")
      .eq("id", input.lessonId)
      .eq("status", "published")
      .maybeSingle();
    if (error)
      throw new HttpError(503, "Die Lektion kann gerade nicht geladen werden.");
    if (!lesson)
      throw new HttpError(
        404,
        "Die Lektion wurde nicht gefunden.",
        "not_found",
      );
    await requireEnrollment(user.id, lesson.course_id);
    if (await isAdminUser(user)) {
      throw new HttpError(
        403,
        "In der Admin-Vorschau wird kein Lernfortschritt gespeichert.",
        "admin_preview_read_only",
      );
    }
    await assertLessonUnlocked(user.id, lesson.id);
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("version")
      .eq("id", lesson.course_id)
      .single();
    if (courseError || !course) {
      throw new HttpError(
        503,
        "Die Kursversion kann gerade nicht sicher geprüft werden.",
      );
    }
    const durationTolerance = Math.max(2, lesson.duration_seconds * 0.01);
    if (
      Math.abs(input.duration - lesson.duration_seconds) > durationTolerance
    ) {
      throw new HttpError(
        400,
        "Die gemeldete Videolaufzeit ist ungültig.",
        "invalid_duration",
      );
    }
    if (input.currentTime > lesson.duration_seconds + 1) {
      throw new HttpError(
        400,
        "Die gemeldete Videoposition ist ungültig.",
        "invalid_position",
      );
    }

    const { data: accessSession, error: accessSessionError } = await admin
      .from("video_access_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson.id)
      .eq("course_version", course.version)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (accessSessionError) {
      throw new HttpError(
        503,
        "Der Videofortschritt kann gerade nicht sicher geprüft werden.",
      );
    }
    if (!accessSession) {
      throw new HttpError(
        403,
        "Starte das Video neu, bevor du den Fortschritt speicherst.",
        "video_session_required",
      );
    }
    const reportedPosition = Math.min(
      lesson.duration_seconds,
      Math.max(0, input.currentTime),
    );
    const { data: recorded, error: recordError } = await admin.rpc(
      "record_video_progress",
      {
        progressing_user_id: user.id,
        access_session_id: accessSession.id,
        target_lesson_id: lesson.id,
        reported_position: reportedPosition,
      },
    );
    if (recordError) {
      if (recordError.code === "42501") {
        throw new HttpError(
          403,
          "Starte das Video neu, bevor du den Fortschritt speicherst.",
          "video_session_required",
        );
      }
      if (recordError.code === "22023") {
        throw new HttpError(
          400,
          "Die gemeldete Videoposition ist ungültig.",
          "invalid_position",
        );
      }
      throw new HttpError(
        503,
        "Der Fortschritt konnte gerade nicht gespeichert werden.",
      );
    }
    const result = Array.isArray(recorded) ? recorded[0] : recorded;
    if (!result)
      throw new HttpError(
        503,
        "Der Fortschritt konnte nicht bestätigt werden.",
      );
    const { count, error: quizError } = await admin
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lesson.id)
      .eq("status", "approved");
    if (quizError)
      throw new HttpError(
        503,
        "Die Quizfreigabe kann gerade nicht geprüft werden.",
      );
    const videoCompleted = Boolean(result?.video_completed);
    return Response.json(
      {
        watchedSeconds: result?.watched_seconds ?? Math.floor(reportedPosition),
        watchedPercent: Math.min(
          100,
          Math.round(
            ((result?.watched_seconds ?? Math.floor(reportedPosition)) /
              lesson.duration_seconds) *
              100,
          ),
        ),
        videoCompleted,
        quizAvailable: videoCompleted && count === 5,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
