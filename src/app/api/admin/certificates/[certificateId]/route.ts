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
  action: z.literal("revoke"),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ certificateId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { certificateId } = await context.params;
    schema.parse(await readJson(request));
    const admin = getSupabaseAdmin();
    const { data: certificate, error } = await admin
      .from("certificates")
      .select("id,user_id,course_id,status,certificate_number")
      .eq("id", certificateId)
      .maybeSingle();
    if (error)
      throw new HttpError(
        503,
        "Das Zertifikat kann gerade nicht geladen werden.",
      );
    if (!certificate)
      throw new HttpError(404, "Das Zertifikat wurde nicht gefunden.");

    if (certificate.status !== "valid") {
      throw new HttpError(
        409,
        "Nur ein gültiges Zertifikat kann widerrufen werden.",
      );
    }
    const { data: revoked, error: revokeError } = await admin.rpc(
      "revoke_certificate_with_audit",
      {
        editing_admin_id: actor.id,
        target_certificate_id: certificate.id,
      },
    );
    if (revokeError) {
      throw new HttpError(
        revokeError.code === "23514" || revokeError.code === "40001"
          ? 409
          : 503,
        "Das Zertifikat konnte nicht sicher widerrufen werden.",
      );
    }
    if (revoked !== certificate.id)
      throw new HttpError(
        503,
        "Der Zertifikatswiderruf wurde nicht bestätigt.",
      );
    const { data: revokedCertificate, error: latestError } = await admin
      .from("certificates")
      .select(
        "id,certificate_number,participant_name,course_version,issued_at,revoked_at,status",
      )
      .eq("id", certificate.id)
      .single();
    if (latestError)
      throw new HttpError(
        503,
        "Der neue Zertifikatsstatus kann gerade nicht geladen werden.",
      );
    return Response.json(
      { ok: true, certificate: revokedCertificate },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
