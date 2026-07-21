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
  status: z.enum(["verified", "processing", "completed", "rejected"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { requestId } = await context.params;
    const { status } = schema.parse(await readJson(request));
    const admin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from("data_requests")
      .select("id,user_id,request_type,status,requested_at,completed_at")
      .eq("id", requestId)
      .maybeSingle();
    if (existingError)
      throw new HttpError(
        503,
        "Die Datenschutzanfrage kann gerade nicht geladen werden.",
      );
    if (!existing)
      throw new HttpError(404, "Die Datenschutzanfrage wurde nicht gefunden.");
    if (["completed", "rejected"].includes(existing.status)) {
      throw new HttpError(
        409,
        "Eine abgeschlossene Datenschutzanfrage kann nicht erneut bearbeitet werden.",
      );
    }
    const completedAt = ["completed", "rejected"].includes(status)
      ? new Date().toISOString()
      : null;
    const { data: updated, error: updateError } = await admin
      .from("data_requests")
      .update({ status, completed_at: completedAt })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .select("id,user_id,request_type,status,requested_at,completed_at")
      .maybeSingle();
    if (updateError)
      throw new HttpError(
        503,
        "Der Datenschutzstatus konnte nicht gespeichert werden.",
      );
    if (!updated)
      throw new HttpError(
        409,
        "Die Datenschutzanfrage wurde zwischenzeitlich geändert.",
      );
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.id,
      actor_role: "admin",
      action: "data_request_status_changed",
      entity_type: "data_request",
      entity_id: updated.id,
      metadata: {
        from: existing.status,
        to: updated.status,
        type: updated.request_type,
      },
    });
    if (auditError)
      throw new HttpError(
        503,
        "Die Datenschutzbearbeitung konnte nicht protokolliert werden.",
      );
    return Response.json(
      {
        ok: true,
        request: {
          id: updated.id,
          userId: updated.user_id,
          type: updated.request_type,
          status: updated.status,
          requestedAt: updated.requested_at,
          completedAt: updated.completed_at,
        },
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
