import { requireUser } from "@/lib/server/auth";
import { observeAuthSession } from "@/lib/server/auth-sessions";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const currentSessionId = await observeAuthSession(request, user.id);
    if (!currentSessionId) {
      throw new HttpError(
        503,
        "Die aktuelle Sitzung konnte nicht zugeordnet werden.",
      );
    }
    const cutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("auth_session_registry")
      .select("session_id,user_agent,first_seen_at,last_seen_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .gte("last_seen_at", cutoff)
      .order("last_seen_at", { ascending: false });
    if (error)
      throw new HttpError(
        503,
        "Die aktiven Sitzungen können gerade nicht geladen werden.",
      );
    return Response.json(
      {
        sessions: (data ?? []).map((session) => ({
          id: session.session_id,
          current: session.session_id === currentSessionId,
          userAgent: session.user_agent,
          firstSeenAt: session.first_seen_at,
          lastSeenAt: session.last_seen_at,
        })),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
