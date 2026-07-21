import { getPublicProduct } from "@/lib/server/catalog";
import { jsonError, noStoreHeaders } from "@/lib/server/http";

export async function GET() {
  try {
    const product = await getPublicProduct();
    return Response.json(product, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
