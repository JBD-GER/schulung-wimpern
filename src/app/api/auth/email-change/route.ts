import { getSiteUrl } from "@/lib/env";
import { requireUser } from "@/lib/server/auth";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailChangeSchema } from "@/lib/validation/account";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = emailChangeSchema.parse(await readJson(request));
    if (!user.email || !user.email_confirmed_at) {
      throw new HttpError(
        409,
        "Die bisherige E-Mail-Adresse muss zuerst bestätigt sein.",
      );
    }
    if (input.email === user.email.toLowerCase()) {
      throw new HttpError(
        409,
        "Die neue E-Mail-Adresse entspricht der bisherigen Adresse.",
      );
    }
    await enforceRateLimit({
      bucket: "auth-email-change",
      subject: user.id,
      maximum: 3,
      windowSeconds: 24 * 60 * 60,
    });
    const supabase = await createClient();
    const { error: reauthenticationError } =
      await supabase.auth.signInWithPassword({
        email: user.email,
        password: input.currentPassword,
      });
    if (reauthenticationError) {
      throw new HttpError(
        401,
        "Die aktuelle Anmeldung konnte nicht bestätigt werden.",
        "reauthentication_failed",
      );
    }
    const { error: updateError } = await supabase.auth.updateUser(
      { email: input.email },
      { emailRedirectTo: `${getSiteUrl()}/api/auth/callback?next=/profil` },
    );
    if (updateError) {
      throw new HttpError(
        400,
        "Die E-Mail-Änderung konnte nicht gestartet werden.",
      );
    }
    const { error: auditError } = await getSupabaseAdmin()
      .from("audit_logs")
      .insert({
        actor_id: user.id,
        actor_role: "learner",
        action: "email_change_requested",
        entity_type: "profile",
        entity_id: user.id,
        metadata: { requiresVerification: true },
      });
    if (auditError)
      throw new HttpError(
        503,
        "Die E-Mail-Änderung konnte nicht sicher protokolliert werden.",
      );
    return Response.json(
      {
        ok: true,
        verificationRequired: true,
        message:
          "Bitte bestätige die Änderung über die versendeten Verifizierungs-E-Mails.",
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
