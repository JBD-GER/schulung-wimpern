import { requireEnrollment } from "@/lib/server/access";
import { requireUser } from "@/lib/server/auth";
import { finalizeCourseCompletion } from "@/lib/server/certificate";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
} from "@/lib/server/http";
import { getCertificateData } from "@/lib/server/queries";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function GET() {
  try {
    return Response.json(await getCertificateData(), {
      headers: noStoreHeaders(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await enforceRateLimit({
      bucket: "certificate-finalization-retry",
      subject: user.id,
      maximum: 6,
      windowSeconds: 60 * 60,
    });
    const enrollment = await requireEnrollment(user.id);
    const result = await finalizeCourseCompletion(
      user.id,
      enrollment.course_id,
    );
    if (result.state === "not_eligible") {
      throw new HttpError(
        409,
        "Der aktuelle, vollständig belegte Kursabschluss konnte nicht bestätigt werden.",
        "certificate_not_eligible",
      );
    }
    if (result.state === "history_blocked") {
      throw new HttpError(
        409,
        "Dieser Zertifikatsverlauf erfordert eine kontrollierte Prüfung.",
        "certificate_history_review_required",
      );
    }
    return Response.json(result, {
      status: result.state === "generating" ? 202 : 200,
      headers: noStoreHeaders(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
