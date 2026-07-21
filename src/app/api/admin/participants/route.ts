import { requireAdmin } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface ParticipantRow {
  participant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  participant_created_at: string;
  enrollment_status: string | null;
  enrollment_granted_at: string | null;
  total_count: number | string;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const searchParams = new URL(request.url).searchParams;
    const query = (searchParams.get("q") ?? "")
      .replace(/[^\p{L}\p{N}@._+\-\s]/gu, "")
      .trim()
      .slice(0, 100);
    const allowedStatuses = new Set([
      "pending_payment",
      "active",
      "completed",
      "revoked",
      "refunded",
      "disputed",
    ]);
    const status = searchParams.get("status");
    if (status && status !== "all" && !allowedStatuses.has(status)) {
      throw new HttpError(400, "Der Teilnehmerstatus ist ungültig.");
    }
    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(searchParams.get("pageSize") ?? "25", 10) || 25,
      ),
    );
    const { data, error } = await getSupabaseAdmin().rpc(
      "list_admin_participants",
      {
        search_text: query,
        requested_status: status && status !== "all" ? status : null,
        page_offset: (page - 1) * pageSize,
        page_limit: pageSize,
      },
    );
    if (error)
      throw new HttpError(
        503,
        "Die Teilnehmerliste kann gerade nicht geladen werden.",
      );
    const rows = (data ?? []) as ParticipantRow[];
    const total = Number(rows[0]?.total_count ?? 0);
    return Response.json(
      {
        participants: rows.map((row) => ({
          id: row.participant_id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          enrollmentStatus: row.enrollment_status,
          enrollmentGrantedAt: row.enrollment_granted_at,
          createdAt: row.participant_created_at,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: total ? Math.ceil(total / pageSize) : 0,
        },
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
