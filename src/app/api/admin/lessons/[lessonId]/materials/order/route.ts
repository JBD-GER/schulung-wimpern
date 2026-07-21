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

const schema = z.object({ materialIds: z.array(z.uuid()).min(1).max(100) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { lessonId } = await context.params;
    const { materialIds } = schema.parse(await readJson(request));
    if (new Set(materialIds).size !== materialIds.length) {
      throw new HttpError(
        400,
        "Jedes Material darf nur einmal in der Reihenfolge vorkommen.",
      );
    }
    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc("reorder_lesson_materials", {
      target_lesson_id: lessonId,
      ordered_material_ids: materialIds,
    });
    if (error)
      throw new HttpError(
        409,
        "Die Materialreihenfolge konnte nicht gespeichert werden.",
      );
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.id,
      actor_role: "admin",
      action: "lesson_materials_reordered",
      entity_type: "lesson",
      entity_id: lessonId,
      metadata: { materialIds },
    });
    if (auditError)
      throw new HttpError(
        503,
        "Die Materialreihenfolge konnte nicht protokolliert werden.",
      );
    return Response.json(
      { ok: true, materialIds },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
