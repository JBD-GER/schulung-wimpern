import { randomUUID } from "node:crypto";

import { optionalEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/server/auth";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["text/plain", "txt"],
]);
const maxFileSize = 20 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  let uploadedKey: string | null = null;
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { lessonId } = await context.params;
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > maxFileSize + 1024 * 1024
    ) {
      throw new HttpError(
        413,
        "Die Materialdatei darf höchstens 20 MB groß sein.",
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > maxFileSize) {
      throw new HttpError(400, "Bitte wähle eine Materialdatei bis 20 MB aus.");
    }
    const extension = allowedTypes.get(file.type);
    if (!extension)
      throw new HttpError(
        415,
        "Dieser Material-Dateityp wird nicht unterstützt.",
      );
    const titleValue = form.get("title");
    const title = (
      typeof titleValue === "string" ? titleValue : file.name
    ).trim();
    if (title.length < 2 || title.length > 200) {
      throw new HttpError(
        400,
        "Der Materialtitel muss zwischen 2 und 200 Zeichen lang sein.",
      );
    }
    const statusValue = form.get("status");
    const status = statusValue === "published" ? "published" : "draft";
    const admin = getSupabaseAdmin();
    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .select("id,course_id")
      .eq("id", lessonId)
      .maybeSingle();
    if (lessonError)
      throw new HttpError(503, "Die Lektion kann gerade nicht geladen werden.");
    if (!lesson) throw new HttpError(404, "Die Lektion wurde nicht gefunden.");
    const { data: lastMaterial, error: positionError } = await admin
      .from("lesson_materials")
      .select("position")
      .eq("lesson_id", lesson.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError)
      throw new HttpError(
        503,
        "Die Materialreihenfolge kann gerade nicht geladen werden.",
      );
    const position = (lastMaterial?.position ?? 0) + 1;
    uploadedKey = `${lesson.course_id}/${lesson.id}/${randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const bucket = optionalEnv("COURSE_MATERIALS_BUCKET") ?? "course-materials";
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(uploadedKey, bytes, { contentType: file.type, upsert: false });
    if (uploadError)
      throw new HttpError(
        503,
        "Die Materialdatei konnte nicht gespeichert werden.",
      );
    const { data: material, error: insertError } = await admin
      .from("lesson_materials")
      .insert({
        lesson_id: lesson.id,
        title,
        file_key: uploadedKey,
        mime_type: file.type,
        position,
        status,
      })
      .select(
        "id,lesson_id,title,mime_type,position,status,created_at,updated_at",
      )
      .single();
    if (insertError || !material) {
      const { error: cleanupError } = await admin.storage
        .from(bucket)
        .remove([uploadedKey]);
      if (cleanupError)
        throw new HttpError(
          503,
          "Die unvollständige Materialanlage muss manuell geprüft werden.",
        );
      uploadedKey = null;
      if (insertError?.code === "23505") {
        throw new HttpError(
          409,
          "Die Materialreihenfolge wurde gleichzeitig geändert. Bitte versuche es erneut.",
        );
      }
      throw new HttpError(503, "Das Material konnte nicht angelegt werden.");
    }
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.id,
      actor_role: "admin",
      action: "lesson_material_created",
      entity_type: "lesson_material",
      entity_id: material.id,
      metadata: { lessonId: lesson.id, status, mimeType: file.type },
    });
    if (auditError)
      throw new HttpError(
        503,
        "Die Materialanlage konnte nicht protokolliert werden.",
      );
    return Response.json(
      { ok: true, material },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
