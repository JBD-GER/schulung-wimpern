import { requireAdmin } from "@/lib/server/auth";
import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await getSupabaseAdmin()
      .from("email_deliveries")
      .select(
        "id,user_id,recipient_email,template,event_key,provider_message_id,status,error_message,sent_at,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return Response.json(
      { deliveries: data ?? [] },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
