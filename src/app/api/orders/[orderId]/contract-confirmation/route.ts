import { createHash } from "node:crypto";

import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const orderIdSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireUser();
    const { orderId } = await context.params;
    const parsedOrderId = orderIdSchema.safeParse(orderId);
    if (!parsedOrderId.success) {
      throw new HttpError(
        400,
        "Die Bestell-ID ist ungültig.",
        "invalid_order_id",
      );
    }

    const { data: checkoutIntent, error } = await getSupabaseAdmin()
      .from("checkout_intents")
      .select(
        "auth_user_id,provisioned_order_id,status,contract_confirmation_text,contract_confirmation_sha256",
      )
      .eq("provisioned_order_id", parsedOrderId.data)
      .eq("auth_user_id", user.id)
      .eq("status", "provisioned")
      .maybeSingle();
    if (error) {
      throw new HttpError(
        503,
        "Die Vertragsbestätigung kann gerade nicht geladen werden.",
      );
    }
    if (
      !checkoutIntent ||
      checkoutIntent.auth_user_id !== user.id ||
      checkoutIntent.provisioned_order_id !== parsedOrderId.data ||
      checkoutIntent.status !== "provisioned" ||
      !checkoutIntent.contract_confirmation_text ||
      !checkoutIntent.contract_confirmation_sha256
    ) {
      throw new HttpError(
        404,
        "Für diese Bestellung ist keine Vertragsbestätigung verfügbar.",
        "not_found",
      );
    }

    const bytes = new TextEncoder().encode(
      checkoutIntent.contract_confirmation_text,
    );
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== checkoutIntent.contract_confirmation_sha256) {
      throw new HttpError(
        503,
        "Die Vertragsbestätigung konnte nicht sicher geprüft werden.",
        "integrity_error",
      );
    }

    return new Response(bytes, {
      headers: noStoreHeaders({
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="vertragsbestaetigung-${parsedOrderId.data}.txt"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
