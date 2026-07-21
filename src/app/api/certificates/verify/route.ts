import { z } from "zod";

import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validCertificateVerificationProof } from "@/lib/server/certificate-verification";

const numberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SWV-[0-9]{4}-[A-Z0-9]{5,10}$/);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join(".");
}

export async function GET(request: Request) {
  try {
    await enforceRateLimit({
      bucket: "certificate-verify",
      subject: requestSubject(request),
      maximum: 30,
      windowSeconds: 3600,
    });
    const searchParams = new URL(request.url).searchParams;
    const number = numberSchema.parse(searchParams.get("number"));
    const proof = searchParams.get("proof");
    if (
      proof &&
      (!/^[A-Za-z0-9_-]{43}$/.test(proof) ||
        !validCertificateVerificationProof(number, proof))
    ) {
      return Response.json(
        { valid: false, status: "not_found" },
        { headers: noStoreHeaders({ "X-Robots-Tag": "noindex, nofollow" }) },
      );
    }
    const admin = getSupabaseAdmin();
    const { data: certificate, error: certificateError } = await admin
      .from("certificates")
      .select(
        "user_id,course_id,certificate_number,participant_name,issued_at,status",
      )
      .eq("certificate_number", number)
      .in("status", ["valid", "revoked"])
      .maybeSingle();
    if (certificateError)
      throw new HttpError(
        503,
        "Die Zertifikatsprüfung ist derzeit nicht verfügbar.",
      );
    if (!certificate) {
      return Response.json(
        { valid: false, status: "not_found" },
        { headers: noStoreHeaders({ "X-Robots-Tag": "noindex, nofollow" }) },
      );
    }
    const [courseResult, profileResult] = await Promise.all([
      admin
        .from("courses")
        .select("title")
        .eq("id", certificate.course_id)
        .single(),
      admin
        .from("profiles")
        .select("certificate_public_name_consent")
        .eq("auth_user_id", certificate.user_id)
        .single(),
    ]);
    if (courseResult.error || profileResult.error) {
      throw new HttpError(
        503,
        "Die Zertifikatsprüfung ist derzeit nicht verfügbar.",
      );
    }
    const course = courseResult.data;
    const profile = profileResult.data;
    const response: Record<string, unknown> = {
      valid: certificate.status === "valid",
      status: certificate.status,
      certificateNumber: certificate.certificate_number,
      courseName: course?.title,
      issuedAt: certificate.issued_at,
    };
    if (profile?.certificate_public_name_consent) {
      response.participantInitials = initials(certificate.participant_name);
    }
    return Response.json(response, {
      headers: noStoreHeaders({ "X-Robots-Tag": "noindex, nofollow" }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
