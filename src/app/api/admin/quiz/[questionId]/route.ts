import { z } from "zod";

import { requireAdmin } from "@/lib/server/auth";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({
  questionText: z.string().trim().min(5).max(1000),
  editorialNote: z.string().trim().max(3000).nullable().optional(),
  status: z.enum(["draft", "approved"]),
  options: z
    .array(
      z.object({
        id: z.uuid(),
        text: z.string().trim().min(1).max(1000),
        isCorrect: z.boolean(),
      }),
    )
    .length(4)
    .refine(
      (options) => options.filter((option) => option.isCorrect).length === 1,
      {
        message: "Genau eine Antwort muss richtig sein.",
      },
    ),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { questionId } = await context.params;
    const input = schema.parse(await readJson(request));
    const admin = getSupabaseAdmin();
    const { data: version, error: updateError } = await admin.rpc(
      "update_quiz_question_content",
      {
        editing_admin_id: actor.id,
        target_question_id: questionId,
        new_question_text: input.questionText,
        new_editorial_note: input.editorialNote ?? null,
        new_status: input.status,
        new_options: input.options,
      },
    );
    if (updateError)
      throw new HttpError(
        400,
        "Die Quizfrage konnte nicht vollständig gespeichert werden.",
      );
    return Response.json(
      { ok: true, questionId, status: input.status, version },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
