import "server-only";

import { createHmac } from "node:crypto";

import type { Session } from "@supabase/supabase-js";
import { decodeJwt } from "jose";

import { optionalEnv } from "@/lib/env";
import { trustedClientIp } from "@/lib/client-ip";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { HttpError } from "./http";

function sessionId(session: Session): string | null {
  try {
    const claims = decodeJwt(session.access_token);
    return typeof claims.session_id === "string" &&
      claims.session_id.length >= 8
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

function requestIpHash(request: Request): string | null {
  const secret = optionalEnv("SESSION_FINGERPRINT_SECRET");
  if (!secret) return null;
  const address = trustedClientIp(request);
  return address
    ? createHmac("sha256", secret).update(address).digest("hex")
    : null;
}

export async function getValidatedSession(userId: string): Promise<Session> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) {
    throw new HttpError(
      401,
      "Die aktuelle Sitzung konnte nicht bestätigt werden.",
      "authentication_required",
    );
  }
  return data.session;
}

export async function observeAuthSession(
  request: Request,
  userId: string,
  suppliedSession?: Session | null,
): Promise<string | null> {
  const session = suppliedSession ?? (await getValidatedSession(userId));
  const id = sessionId(session);
  if (!id) return null;
  const { error } = await getSupabaseAdmin().rpc("observe_auth_session", {
    observed_session_id: id,
    observed_user_id: userId,
    observed_user_agent:
      request.headers.get("user-agent")?.slice(0, 500) ?? null,
    observed_ip_hash: requestIpHash(request),
  });
  if (error)
    throw new HttpError(
      503,
      "Die Sitzungsübersicht kann gerade nicht aktualisiert werden.",
    );
  return id;
}

export function authSessionId(session: Session): string | null {
  return sessionId(session);
}
