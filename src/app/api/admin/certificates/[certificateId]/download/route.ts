import { createHash } from "node:crypto";

import { optionalEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/server/auth";
import { certificateFileAvailable } from "@/lib/server/certificate-state";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ certificateId: string }> },
) {
  try {
    await requireAdmin();
    const { certificateId } = await context.params;
    const admin = getSupabaseAdmin();
    const { data: certificate, error: certificateError } = await admin
      .from("certificates")
      .select("certificate_number,file_key,file_sha256,status")
      .eq("id", certificateId)
      .maybeSingle();
    if (certificateError)
      throw new HttpError(
        503,
        "Das Zertifikat kann gerade nicht geladen werden.",
      );
    if (
      !certificateFileAvailable(certificate, ["valid", "revoked", "archived"])
    ) {
      throw new HttpError(404, "Die Zertifikatsdatei wurde nicht gefunden.");
    }
    const { data, error } = await admin.storage
      .from(optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates")
      .download(certificate.file_key);
    if (error || !data)
      throw new HttpError(
        503,
        "Die Zertifikatsdatei kann gerade nicht geladen werden.",
      );
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      certificate.file_sha256
    ) {
      throw new HttpError(
        503,
        "Die Dateiintegrität konnte nicht bestätigt werden.",
      );
    }
    return new Response(bytes, {
      headers: noStoreHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${certificate.certificate_number}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
