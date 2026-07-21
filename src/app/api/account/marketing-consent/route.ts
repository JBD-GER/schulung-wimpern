import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import {
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";
import { HttpError } from "@/lib/server/http";

const schema = z.object({
  granted: z.boolean(),
  consentVersion: z.string().trim().min(1).max(50).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const { data, error } = await getSupabaseAdmin()
      .from("consent_records")
      .select("granted,consent_version,created_at")
      .eq("user_id", user.id)
      .eq("consent_type", "marketing_email")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new HttpError(
        503,
        "Die Einwilligung kann gerade nicht geladen werden.",
      );
    return Response.json(
      {
        granted: data?.granted ?? false,
        consentVersion: data?.consent_version ?? null,
        currentConsentVersion: requireEnv("MARKETING_CONSENT_VERSION"),
        updatedAt: data?.created_at ?? null,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await readJson(request));
    const currentVersion = requireEnv("MARKETING_CONSENT_VERSION");
    if (input.consentVersion && input.consentVersion !== currentVersion) {
      throw new HttpError(
        409,
        "Die Einwilligungsversion wurde aktualisiert. Bitte lade die Seite neu.",
      );
    }
    const { error } = await getSupabaseAdmin()
      .from("consent_records")
      .insert({
        user_id: user.id,
        consent_type: "marketing_email",
        consent_version: currentVersion,
        granted: input.granted,
        proof: { source: "profile" },
      });
    if (error) throw error;
    return Response.json(
      { ok: true, granted: input.granted },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
