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

const schema = z.object({ status: z.enum(["active", "revoked"]) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { userId } = await context.params;
    const { status } = schema.parse(await readJson(request));
    const admin = getSupabaseAdmin();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id")
      .eq("slug", "online-schulung-wimpernverlaengerung")
      .single();
    if (courseError)
      throw new HttpError(503, "Der Kurs kann gerade nicht geladen werden.");
    if (!course) throw new HttpError(404, "Der Kurs wurde nicht gefunden.");
    const { data, error } = await admin.rpc("set_admin_course_access", {
      editing_admin_id: actor.id,
      target_user_id: userId,
      target_course_id: course.id,
      requested_status: status,
    });
    if (error) {
      throw new HttpError(
        ["23514", "40001", "23505"].includes(error.code) ? 409 : 503,
        status === "active"
          ? "Der Zugang kann aus seinem aktuellen Status nicht erneut aktiviert werden."
          : "Es gibt keinen widerrufbaren aktiven Zugang.",
      );
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.enrollment_id)
      throw new HttpError(503, "Die Zugriffsänderung wurde nicht bestätigt.");
    return Response.json(
      {
        ok: true,
        status: result.resulting_status,
        enrollmentId: result.enrollment_id,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
