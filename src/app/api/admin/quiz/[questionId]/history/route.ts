import { requireAdmin } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    await requireAdmin();
    const { questionId } = await context.params;
    const admin = getSupabaseAdmin();
    const [questionResult, historyResult] = await Promise.all([
      admin
        .from("quiz_questions")
        .select(
          "id,version,question_text,editorial_note,status,approved_at,approved_by,updated_at",
        )
        .eq("id", questionId)
        .maybeSingle(),
      admin
        .from("quiz_question_versions")
        .select(
          "id,version,question_text,editorial_note,status,options_snapshot,changed_by,created_at",
        )
        .eq("question_id", questionId)
        .order("version", { ascending: false }),
    ]);
    if (questionResult.error || historyResult.error) {
      throw new HttpError(
        503,
        "Der Versionsverlauf kann gerade nicht geladen werden.",
      );
    }
    if (!questionResult.data)
      throw new HttpError(404, "Die Quizfrage wurde nicht gefunden.");
    return Response.json(
      {
        current: {
          id: questionResult.data.id,
          version: questionResult.data.version,
          questionText: questionResult.data.question_text,
          editorialNote: questionResult.data.editorial_note,
          status: questionResult.data.status,
          approvedAt: questionResult.data.approved_at,
          approvedBy: questionResult.data.approved_by,
          updatedAt: questionResult.data.updated_at,
        },
        versions: (historyResult.data ?? []).map((version) => ({
          id: version.id,
          version: version.version,
          questionText: version.question_text,
          editorialNote: version.editorial_note,
          status: version.status,
          options: version.options_snapshot,
          changedBy: version.changed_by,
          createdAt: version.created_at,
        })),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
