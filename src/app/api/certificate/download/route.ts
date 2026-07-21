import { createHash } from "node:crypto";

import { optionalEnv } from "@/lib/env";
import { requireUser } from "@/lib/server/auth";
import { certificateDownloadAvailable } from "@/lib/server/certificate-state";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireUser();
    const admin = getSupabaseAdmin();
    const { data: certificate, error: certificateError } = await admin
      .from("certificates")
      .select("participant_name,file_key,file_sha256,status")
      .eq("user_id", user.id)
      .eq("status", "valid")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (certificateError)
      throw new HttpError(
        503,
        "Das Zertifikat kann gerade nicht geladen werden.",
      );
    if (!certificateDownloadAvailable(certificate)) {
      throw new HttpError(
        404,
        "Dein Zertifikat ist noch nicht verfügbar.",
        "not_found",
      );
    }
    const { data, error } = await admin.storage
      .from(optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates")
      .download(certificate.file_key);
    if (error || !data)
      throw new HttpError(
        503,
        "Das Zertifikat kann gerade nicht geladen werden.",
      );
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      certificate.file_sha256
    ) {
      throw new HttpError(
        503,
        "Die Zertifikatsdatei konnte nicht sicher geprüft werden.",
        "integrity_error",
      );
    }
    const filename = `zertifikat-wimpernverlaengerung-${certificate.participant_name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()}.pdf`;
    return new Response(bytes, {
      headers: noStoreHeaders({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
