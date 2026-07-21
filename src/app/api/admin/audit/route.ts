import { requireAdmin } from "@/lib/server/auth";
import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await getSupabaseAdmin()
      .from("audit_logs")
      .select(
        "id,actor_id,actor_role,action,entity_type,entity_id,metadata,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;
    return Response.json({ events: data ?? [] }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
