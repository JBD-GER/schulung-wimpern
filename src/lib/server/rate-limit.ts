import "server-only";

import { createHash } from "node:crypto";

import { trustedClientIp } from "@/lib/client-ip";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { HttpError } from "./http";

function subjectHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function requestSubject(
  request: Request,
  fallback = "anonymous",
): string {
  return trustedClientIp(request) ?? fallback;
}

export async function enforceRateLimit(options: {
  bucket: string;
  subject: string;
  maximum: number;
  windowSeconds: number;
}): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    event_bucket: options.bucket,
    event_subject_hash: subjectHash(options.subject),
    maximum_events: options.maximum,
    window_seconds: options.windowSeconds,
  });
  if (error)
    throw new HttpError(
      503,
      "Die Anfrage kann gerade nicht geprüft werden.",
      "rate_limit_unavailable",
    );
  if (data !== true) {
    throw new HttpError(
      429,
      "Zu viele Anfragen. Bitte versuche es später erneut.",
      "rate_limited",
    );
  }
}
