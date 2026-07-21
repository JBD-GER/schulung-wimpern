import { requireAdmin } from "@/lib/server/auth";
import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireAdmin();
    const admin = getSupabaseAdmin();
    const { data: questions, error } = await admin
      .from("quiz_questions")
      .select(
        "id,lesson_id,position,question_text,editorial_note,status,approved_at,approved_by,version",
      )
      .order("lesson_id")
      .order("position");
    if (error) throw error;
    const ids = (questions ?? []).map((question) => question.id);
    const lessonIds = [
      ...new Set((questions ?? []).map((question) => question.lesson_id)),
    ];
    const [
      { data: options, error: optionError },
      { data: lessons, error: lessonError },
    ] = await Promise.all([
      ids.length
        ? admin
            .from("quiz_options")
            .select("id,question_id,option_text,is_correct,position")
            .in("question_id", ids)
            .order("position")
        : Promise.resolve({ data: [], error: null }),
      lessonIds.length
        ? admin.from("lessons").select("id,position,title").in("id", lessonIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (optionError || lessonError) throw optionError ?? lessonError;
    const lessonById = new Map(
      (lessons ?? []).map((lesson) => [lesson.id, lesson]),
    );
    const sortedQuestions = [...(questions ?? [])].sort((a, b) => {
      const lessonDifference =
        (lessonById.get(a.lesson_id)?.position ?? 0) -
        (lessonById.get(b.lesson_id)?.position ?? 0);
      return lessonDifference || a.position - b.position;
    });
    return Response.json(
      {
        questions: sortedQuestions.map((question) => ({
          id: question.id,
          lessonId: question.lesson_id,
          lessonPosition: lessonById.get(question.lesson_id)?.position ?? null,
          lessonTitle: lessonById.get(question.lesson_id)?.title ?? null,
          position: question.position,
          questionText: question.question_text,
          editorialNote: question.editorial_note,
          status: question.status,
          approvedAt: question.approved_at,
          approvedBy: question.approved_by,
          version: question.version,
          options: (options ?? [])
            .filter((option) => option.question_id === question.id)
            .map((option) => ({
              id: option.id,
              text: option.option_text,
              isCorrect: option.is_correct,
              position: option.position,
            })),
        })),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
