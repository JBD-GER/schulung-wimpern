import { getCurrentUser } from "@/lib/server/auth";
import { authSessionId, getValidatedSession } from "@/lib/server/auth-sessions";
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
    const user = await getCurrentUser();
    const session = user ? await getValidatedSession(user.id) : null;
    const currentSessionId = session ? authSessionId(session) : null;
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    if (user && currentSessionId) {
      const { error: registryError } = await getSupabaseAdmin()
        .from("auth_session_registry")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("session_id", currentSessionId);
      if (registryError)
        throw new HttpError(
          503,
          "Die Sitzungsübersicht konnte nicht aktualisiert werden.",
        );
    }
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
