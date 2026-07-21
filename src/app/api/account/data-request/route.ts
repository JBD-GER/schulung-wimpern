import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({ type: z.enum(["deletion", "correction"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "account-data-request",
      subject: user.id,
      maximum: 5,
      windowSeconds: 24 * 60 * 60,
    });
    const admin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from("data_requests")
      .select("id,request_type,status,requested_at,completed_at")
      .eq("user_id", user.id)
      .eq("request_type", input.type)
      .in("status", ["requested", "verified", "processing"])
      .maybeSingle();
    if (existingError)
      throw new HttpError(
        503,
        "Die Datenschutzanfrage kann gerade nicht geprüft werden.",
      );
    if (existing) {
      return Response.json(
        { ok: true, created: false, request: existing },
        { headers: noStoreHeaders() },
      );
    }
    const { data, error } = await admin
      .from("data_requests")
      .insert({ user_id: user.id, request_type: input.type })
      .select("id,request_type,status,requested_at,completed_at")
      .single();
    if (error?.code === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("data_requests")
        .select("id,request_type,status,requested_at,completed_at")
        .eq("user_id", user.id)
        .eq("request_type", input.type)
        .in("status", ["requested", "verified", "processing"])
        .maybeSingle();
      if (racedError || !raced) {
        throw new HttpError(
          503,
          "Die Datenschutzanfrage kann gerade nicht bestätigt werden.",
        );
      }
      return Response.json(
        { ok: true, created: false, request: raced },
        { headers: noStoreHeaders() },
      );
    }
    if (error || !data)
      throw new HttpError(
        503,
        "Die Datenschutzanfrage konnte nicht gespeichert werden.",
      );
    return Response.json(
      { ok: true, created: true, request: data },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
