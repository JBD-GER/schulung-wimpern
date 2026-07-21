import { getSiteUrl } from "@/lib/env";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { passwordResetSchema } from "@/lib/validation/account";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = passwordResetSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "password-reset",
      subject: `${requestSubject(request)}:${input.email}`,
      maximum: 4,
      windowSeconds: 3600,
    });
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${getSiteUrl()}/api/auth/callback?type=recovery&next=/passwort-zuruecksetzen`,
    });
    if (error) {
      throw new HttpError(
        503,
        "Der sichere Link konnte gerade nicht versendet werden. Bitte versuche es später erneut.",
        "password_reset_unavailable",
      );
    }
    return Response.json(
      {
        ok: true,
        message:
          "Wenn ein Konto zu dieser Adresse existiert, erhältst du gleich eine E-Mail.",
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
