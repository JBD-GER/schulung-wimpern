import {
  assertLessonUnlocked,
  enrollmentHasDurableCompletion,
  requireEnrollment,
} from "@/lib/server/access";
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
      .select("id,user_id,lesson_id,submitted_at")
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
    const enrollment = await requireEnrollment(user.id, lesson.course_id);
    if (await isAdminUser(user)) {
      throw new HttpError(
        403,
        "Wissenstests sind in der Admin-Vorschau deaktiviert.",
        "admin_preview_read_only",
      );
    }
    const durableCompletion = enrollmentHasDurableCompletion(enrollment);
    if (durableCompletion && !attempt.submitted_at) {
      throw new HttpError(
        409,
        "Du hast den Kurs bereits abgeschlossen. Deine bestätigten Ergebnisse bleiben unverändert.",
        "course_already_completed",
      );
    }
    if (!durableCompletion) {
      await assertLessonUnlocked(user.id, lesson.id);
    }

    const { data, error } = await admin.rpc("submit_quiz_attempt", {
      submitting_user_id: user.id,
      target_attempt_id: input.attemptId,
      submitted_answers: input.answers,
    });
    if (error?.code === "23514") {
      throw new HttpError(
        409,
        "Der Lernstand wurde zwischenzeitlich abgeschlossen oder geändert. Lade die Lektion neu.",
        "learning_state_changed",
      );
    }
    if (error?.code === "42501") {
      throw new HttpError(
        403,
        "Für diese Quizabgabe besteht kein aktiver Kurszugang.",
        "enrollment_required",
      );
    }
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
    let certificateConfirmationRequired = false;
    if (result.course_completed) {
      try {
        // This sends the idempotent completion notification. Without the
        // learner's durable name confirmation finalization stops before any
        // certificate row, PDF, or certificate e-mail is created.
        const finalization = await finalizeCourseCompletion(
          user.id,
          lesson.course_id,
        );
        certificateConfirmationRequired =
          finalization.state === "confirmation_required";
      } catch {
        // The quiz, snapshot, and completed enrollment were already committed
        // atomically. The learner can still confirm or retry from /zertifikat.
        certificateConfirmationRequired = true;
      }
    }
    return Response.json(
      {
        score: result.score,
        total: 5,
        passed: result.passed,
        nextLessonSlug,
        certificateConfirmationRequired: result.course_completed
          ? certificateConfirmationRequired
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
