import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { getProfileData } from "@/lib/server/queries";

export async function GET() {
  try {
    return Response.json(await getProfileData(), { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
