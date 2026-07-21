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
import { accountUpdateSchema } from "@/lib/validation/account";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = accountUpdateSchema.parse(await readJson(request));
    const admin = getSupabaseAdmin();
    const [profileResult, historyResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name,last_name,certificate_name")
        .eq("auth_user_id", user.id)
        .single(),
      admin
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["valid", "revoked", "archived"]),
    ]);
    if (profileResult.error || !profileResult.data || historyResult.error) {
      throw new HttpError(
        503,
        "Der Zertifikatsname kann gerade nicht sicher geprüft werden.",
      );
    }
    const profile = profileResult.data;
    const currentCertificateIdentity =
      profile.certificate_name?.trim() ||
      `${profile.first_name} ${profile.last_name}`.trim();
    const requestedCertificateName =
      input.certificateName === undefined
        ? profile.certificate_name
        : input.certificateName;
    const requestedCertificateIdentity =
      requestedCertificateName?.trim() ||
      `${input.firstName} ${input.lastName}`.trim();
    const certificateIdentityChanged =
      requestedCertificateIdentity !== currentCertificateIdentity;

    if (certificateIdentityChanged && (historyResult.count ?? 0) > 0) {
      throw new HttpError(
        409,
        "Nach der Ausstellung muss eine Namenskorrektur sicher bestätigt und neu ausgestellt werden.",
        "certificate_reissue_required",
      );
    }
    if (certificateIdentityChanged) {
      if (!user.email || !input.currentPassword) {
        throw new HttpError(
          401,
          "Bestätige die Änderung des Zertifikatsnamens mit deinem aktuellen Passwort.",
          "reauthentication_required",
        );
      }
      await enforceRateLimit({
        bucket: "certificate-name-reauthentication",
        subject: user.id,
        maximum: 5,
        windowSeconds: 30 * 60,
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
          "Das aktuelle Passwort ist nicht korrekt.",
          "reauthentication_failed",
        );
      }
    }
    const updates = {
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone ?? null,
      certificate_name: input.certificateName ?? undefined,
      billing_type: input.billingType ?? undefined,
      company_name:
        input.billingType === "private"
          ? null
          : (input.companyName ?? undefined),
      contact_person:
        input.billingType === "private"
          ? null
          : (input.contactPerson ?? undefined),
      billing_address: input.billingAddress ?? undefined,
      tax_id:
        input.billingType === "private" ? null : (input.taxId ?? undefined),
    };
    const { data, error } = await admin
      .from("profiles")
      .update(updates)
      .eq("auth_user_id", user.id)
      .select(
        "first_name,last_name,certificate_name,email,phone,billing_type,company_name,contact_person,billing_address,tax_id",
      )
      .single();
    if (error)
      throw new HttpError(
        503,
        "Deine Profildaten konnten nicht gespeichert werden.",
      );
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: "learner",
      action: "profile_updated",
      entity_type: "profile",
      entity_id: user.id,
      metadata: {
        fields: Object.keys(input).filter(
          (field) => field !== "currentPassword",
        ),
        certificateIdentityChanged,
      },
    });
    if (auditError)
      throw new HttpError(
        503,
        "Die Profiländerung konnte nicht sicher protokolliert werden.",
      );
    return Response.json(
      { ok: true, profile: data },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
