import { requireAdmin } from "@/lib/server/auth";
import { getAdminOverview } from "@/lib/server/queries";
import { jsonError, noStoreHeaders } from "@/lib/server/http";

export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getAdminOverview(), {
      headers: noStoreHeaders(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
