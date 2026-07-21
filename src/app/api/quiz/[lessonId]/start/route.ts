import { randomInt } from "node:crypto";

import {
  assertLessonUnlocked,
  enrollmentHasDurableCompletion,
  requireEnrollment,
} from "@/lib/server/access";
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
import { videoTokenSchema } from "@/lib/validation/learning";

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { lessonId: routeLessonId } = await context.params;
    const { lessonId } = videoTokenSchema.parse(await readJson(request));
    if (lessonId !== routeLessonId)
      throw new HttpError(400, "Die Lektions-ID stimmt nicht überein.");
    await enforceRateLimit({
      bucket: "quiz-start",
      subject: user.id,
      maximum: 30,
      windowSeconds: 3600,
    });
    const admin = getSupabaseAdmin();
    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .select("id,course_id,status")
      .eq("id", lessonId)
      .eq("status", "published")
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
    if (enrollmentHasDurableCompletion(enrollment)) {
      throw new HttpError(
        409,
        "Du hast den Kurs bereits abgeschlossen. Deine bestätigten Ergebnisse bleiben unverändert.",
        "course_already_completed",
      );
    }
    await assertLessonUnlocked(user.id, lesson.id);
    const [progressResult, courseResult] = await Promise.all([
      admin
        .from("lesson_progress")
        .select("video_completed,course_version")
        .eq("user_id", user.id)
        .eq("lesson_id", lesson.id)
        .maybeSingle(),
      admin
        .from("courses")
        .select("version")
        .eq("id", lesson.course_id)
        .single(),
    ]);
    if (progressResult.error || courseResult.error || !courseResult.data)
      throw new HttpError(
        503,
        "Der Lernfortschritt kann gerade nicht geladen werden.",
      );
    const progress = progressResult.data;
    const courseVersion = courseResult.data.version;
    if (
      !progress?.video_completed ||
      progress.course_version !== courseVersion
    ) {
      throw new HttpError(
        403,
        "Sieh dir zuerst mindestens 90 % des Videos an.",
        "video_incomplete",
      );
    }

    const { data: questions, error: questionError } = await admin
      .from("quiz_questions")
      .select("id,position,question_text")
      .eq("lesson_id", lesson.id)
      .eq("status", "approved")
      .order("position");
    if (questionError)
      throw new HttpError(
        503,
        "Der Wissenstest kann gerade nicht geladen werden.",
      );
    if (questions?.length !== 5) {
      throw new HttpError(
        409,
        "Der Wissenstest ist noch nicht redaktionell freigegeben.",
        "quiz_not_approved",
      );
    }
    const questionIds = questions.map((question) => question.id);
    const { data: options, error: optionError } = await admin
      .from("quiz_options")
      .select("id,question_id,position,option_text,is_correct")
      .in("question_id", questionIds)
      .order("position");
    if (optionError)
      throw new HttpError(
        503,
        "Der Wissenstest kann gerade nicht geladen werden.",
      );
    if (options?.length !== 20) {
      throw new HttpError(
        409,
        "Der Wissenstest ist unvollständig.",
        "quiz_invalid",
      );
    }
    const shuffledQuestions = shuffle(questions);
    const optionOrder: Record<string, string[]> = {};
    const answerKey: Record<string, string> = {};
    const responseQuestions = shuffledQuestions.map((question) => {
      const shuffledOptions = shuffle(
        options.filter((option) => option.question_id === question.id),
      );
      if (shuffledOptions.length !== 4)
        throw new HttpError(
          409,
          "Der Wissenstest ist unvollständig.",
          "quiz_invalid",
        );
      optionOrder[question.id] = shuffledOptions.map((option) => option.id);
      const correctOption = shuffledOptions.find((option) => option.is_correct);
      if (!correctOption)
        throw new HttpError(
          409,
          "Der Wissenstest ist unvollständig.",
          "quiz_invalid",
        );
      answerKey[question.id] = correctOption.id;
      return {
        id: question.id,
        text: question.question_text,
        options: shuffledOptions.map((option) => ({
          id: option.id,
          text: option.option_text,
        })),
      };
    });

    let attempt: { id: string } | null = null;
    for (let retry = 0; retry < 3 && !attempt; retry += 1) {
      const { data: latest, error: latestError } = await admin
        .from("quiz_attempts")
        .select("attempt_number")
        .eq("user_id", user.id)
        .eq("lesson_id", lesson.id)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError)
        throw new HttpError(
          503,
          "Die Quizversuche können gerade nicht geladen werden.",
        );
      const { data, error } = await admin
        .from("quiz_attempts")
        .insert({
          user_id: user.id,
          lesson_id: lesson.id,
          course_version: courseVersion,
          attempt_number: (latest?.attempt_number ?? 0) + 1,
          question_order: shuffledQuestions.map((question) => question.id),
          option_order: optionOrder,
          answer_key: answerKey,
        })
        .select("id")
        .single();
      if (!error && data) attempt = data;
      else if (!error || error.code !== "23505") {
        throw new HttpError(
          503,
          "Der Wissenstest konnte nicht gestartet werden.",
        );
      }
    }
    if (!attempt)
      throw new HttpError(
        409,
        "Der Wissenstest konnte nicht gestartet werden. Bitte versuche es erneut.",
      );

    return Response.json(
      { attemptId: attempt.id, questions: responseQuestions },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
