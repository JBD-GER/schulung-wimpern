import { requireUser } from "@/lib/server/auth";
import {
  authSessionId,
  getValidatedSession,
  observeAuthSession,
} from "@/lib/server/auth-sessions";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const session = await getValidatedSession(user.id);
    const currentSessionId = authSessionId(session);
    if (!currentSessionId)
      throw new HttpError(
        503,
        "Die aktuelle Sitzung konnte nicht zugeordnet werden.",
      );
    await observeAuthSession(request, user.id, session);
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
    const { error: registryError } = await getSupabaseAdmin()
      .from("auth_session_registry")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .neq("session_id", currentSessionId)
      .is("revoked_at", null);
    if (registryError)
      throw new HttpError(
        503,
        "Die Sitzungsübersicht konnte nicht aktualisiert werden.",
      );
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
