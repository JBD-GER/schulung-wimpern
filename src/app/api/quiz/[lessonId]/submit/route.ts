import { assertLessonUnlocked, requireEnrollment } from "@/lib/server/access";
import { isAdminUser, requireUser } from "@/lib/server/auth";
import { finalizeCourseCompletion } from "@/lib/server/certificate";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { quizSubmissionSchema } from "@/lib/validation/learning";

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { lessonId } = await context.params;
    const input = quizSubmissionSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "quiz-submit",
      subject: user.id,
      maximum: 12,
      windowSeconds: 600,
    });
    const admin = getSupabaseAdmin();
    const { data: attempt, error: attemptError } = await admin
      .from("quiz_attempts")
      .select("id,user_id,lesson_id")
      .eq("id", input.attemptId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (attemptError)
      throw new HttpError(
        503,
        "Der Quizversuch kann gerade nicht geladen werden.",
      );
    if (!attempt || attempt.lesson_id !== lessonId) {
      throw new HttpError(
        404,
        "Der Quizversuch wurde nicht gefunden.",
        "attempt_not_found",
      );
    }
    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .select("id,course_id,position,title")
      .eq("id", lessonId)
      .maybeSingle();
    if (lessonError)
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
        "Wissenstests sind in der Admin-Vorschau deaktiviert.",
        "admin_preview_read_only",
      );
    }
    await assertLessonUnlocked(user.id, lesson.id);

    const { data, error } = await admin.rpc("submit_quiz_attempt", {
      submitting_user_id: user.id,
      target_attempt_id: input.attemptId,
      submitted_answers: input.answers,
    });
    if (error)
      throw new HttpError(
        400,
        "Die Antworten sind unvollständig oder ungültig.",
        "invalid_answers",
      );
    const result = Array.isArray(data) ? data[0] : data;
    if (!result)
      throw new HttpError(
        503,
        "Der Wissenstest konnte nicht ausgewertet werden.",
      );

    let nextLessonSlug: string | undefined;
    if (result.passed) {
      const { data: nextLesson, error: nextLessonError } = await admin
        .from("lessons")
        .select("slug")
        .eq("course_id", lesson.course_id)
        .eq("position", lesson.position + 1)
        .eq("status", "published")
        .maybeSingle();
      if (nextLessonError)
        throw new HttpError(
          503,
          "Die nächste Lektion kann gerade nicht geladen werden.",
        );
      nextLessonSlug = nextLesson?.slug;
    }
    let certificatePending = false;
    if (result.course_completed) {
      try {
        const finalization = await finalizeCourseCompletion(
          user.id,
          lesson.course_id,
        );
        certificatePending = finalization.state !== "valid";
      } catch {
        // The quiz result is already committed atomically. Certificate
        // generation has its own idempotent, user-reachable retry path.
        certificatePending = true;
      }
    }

    return Response.json(
      {
        score: result.score,
        total: 5,
        passed: result.passed,
        nextLessonSlug,
        certificatePending: result.course_completed
          ? certificatePending
          : undefined,
        topicsToReview: result.passed
          ? undefined
          : [`Sieh dir die Kernaussagen aus „${lesson.title}“ noch einmal an.`],
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
