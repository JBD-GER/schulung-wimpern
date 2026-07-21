import { requireAdmin } from "@/lib/server/auth";
import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = (new URL(request.url).searchParams.get("q") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 100);
    let certificateQuery = getSupabaseAdmin()
      .from("certificates")
      .select(
        "id,user_id,course_id,certificate_number,participant_name,course_version,issued_at,revoked_at,status,file_sha256",
      )
      .order("issued_at", { ascending: false })
      .limit(100);
    if (query)
      certificateQuery = certificateQuery.ilike(
        "certificate_number",
        `%${query.replace(/[^A-Z0-9-]/g, "")}%`,
      );
    const { data, error } = await certificateQuery;
    if (error) throw error;
    return Response.json(
      { certificates: data ?? [] },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
