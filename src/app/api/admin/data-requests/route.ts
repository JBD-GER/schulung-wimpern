import { requireAdmin } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const allowedStatuses = new Set([
  "requested",
  "verified",
  "processing",
  "completed",
  "rejected",
]);

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    if (status && status !== "all" && !allowedStatuses.has(status)) {
      throw new HttpError(
        400,
        "Der angeforderte Datenschutzstatus ist ungültig.",
      );
    }
    const admin = getSupabaseAdmin();
    let query = admin
      .from("data_requests")
      .select("id,user_id,request_type,status,requested_at,completed_at")
      .order("requested_at", { ascending: true })
      .limit(250);
    if (!status)
      query = query.in("status", ["requested", "verified", "processing"]);
    else if (status !== "all") query = query.eq("status", status);

    const { data: requests, error } = await query;
    if (error)
      throw new HttpError(
        503,
        "Die Datenschutzanfragen können gerade nicht geladen werden.",
      );
    const userIds = [...new Set((requests ?? []).map((item) => item.user_id))];
    const { data: profiles, error: profileError } = userIds.length
      ? await admin
          .from("profiles")
          .select("auth_user_id,first_name,last_name,email")
          .in("auth_user_id", userIds)
      : { data: [], error: null };
    if (profileError)
      throw new HttpError(
        503,
        "Die Datenschutzanfragen können gerade nicht zugeordnet werden.",
      );
    const profileByUser = new Map(
      (profiles ?? []).map((profile) => [profile.auth_user_id, profile]),
    );
    return Response.json(
      {
        requests: (requests ?? []).map((item) => {
          const profile = profileByUser.get(item.user_id);
          return {
            id: item.id,
            userId: item.user_id,
            type: item.request_type,
            status: item.status,
            requestedAt: item.requested_at,
            completedAt: item.completed_at,
            participant: profile
              ? {
                  firstName: profile.first_name,
                  lastName: profile.last_name,
                  email: profile.email,
                }
              : null,
          };
        }),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
