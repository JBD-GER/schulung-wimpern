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

const schema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: "Mindestens ein Feld muss geändert werden.",
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ materialId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { materialId } = await context.params;
    const input = schema.parse(await readJson(request));
    const updates: {
      title?: string;
      status?: "draft" | "published" | "archived";
    } = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.status !== undefined) updates.status = input.status;
    const admin = getSupabaseAdmin();
    const { data: material, error } = await admin
      .from("lesson_materials")
      .update(updates)
      .eq("id", materialId)
      .select(
        "id,lesson_id,title,mime_type,position,status,created_at,updated_at",
      )
      .maybeSingle();
    if (error)
      throw new HttpError(503, "Das Material konnte nicht gespeichert werden.");
    if (!material)
      throw new HttpError(404, "Das Material wurde nicht gefunden.");
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.id,
      actor_role: "admin",
      action: "lesson_material_updated",
      entity_type: "lesson_material",
      entity_id: material.id,
      metadata: { fields: Object.keys(input), status: material.status },
    });
    if (auditError)
      throw new HttpError(
        503,
        "Die Materialänderung konnte nicht protokolliert werden.",
      );
    return Response.json({ ok: true, material }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
