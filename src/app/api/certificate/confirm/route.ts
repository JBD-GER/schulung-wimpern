import { requireEnrollment } from "@/lib/server/access";
import { requireUser } from "@/lib/server/auth";
import { confirmCertificateIssuance } from "@/lib/server/certificate";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { certificateConfirmationSchema } from "@/lib/validation/learning";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = certificateConfirmationSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "certificate-issuance-confirmation",
      subject: user.id,
      maximum: 5,
      windowSeconds: 60 * 60,
    });
    const enrollment = await requireEnrollment(user.id);
    const result = await confirmCertificateIssuance(
      user.id,
      enrollment.course_id,
      input.participantName,
    );
    if (result.state === "not_eligible") {
      throw new HttpError(
        409,
        "Das Zertifikat kann erst nach allen sieben bestandenen Lektionen ausgestellt werden.",
        "certificate_not_eligible",
      );
    }
    if (result.state === "confirmation_required") {
      throw new HttpError(
        409,
        "Die Zertifikatsbestätigung konnte nicht vollständig gespeichert werden.",
        "certificate_confirmation_required",
      );
    }
    if (result.state === "history_blocked") {
      throw new HttpError(
        409,
        "Für diesen Kurs wurde bereits ein Zertifikat ausgestellt. Eine erneute automatische Ausstellung ist nicht möglich.",
        "certificate_already_issued",
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
