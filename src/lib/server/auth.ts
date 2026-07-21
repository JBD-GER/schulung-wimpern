import "server-only";

import type { User } from "@supabase/supabase-js";

import { getAdminEmails } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { authSessionId } from "./auth-sessions";
import { HttpError } from "./http";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  // getUser() has already verified the access token with Supabase Auth. The
  // paired session read is used only to obtain its immutable session_id so a
  // locally revoked "other session" cannot keep using its still-unexpired JWT.
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (
    sessionError ||
    !sessionData.session ||
    sessionData.session.user.id !== data.user.id
  ) {
    return null;
  }
  const currentSessionId = authSessionId(sessionData.session);
  if (!currentSessionId) return null;

  const { data: registeredSession, error: registryError } =
    await getSupabaseAdmin()
      .from("auth_session_registry")
      .select("revoked_at")
      .eq("session_id", currentSessionId)
      .eq("user_id", data.user.id)
      .maybeSingle();
  if (registryError) {
    throw new HttpError(
      503,
      "Die Sitzung kann gerade nicht sicher geprüft werden.",
    );
  }
  if (registeredSession?.revoked_at) return null;
  return data.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user)
    throw new HttpError(401, "Bitte melde dich an.", "authentication_required");
  return user;
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && getAdminEmails().has(email.toLowerCase()));
}

export async function isAdminUser(
  user: Pick<User, "id" | "email">,
): Promise<boolean> {
  if (isAdminEmail(user.email)) return true;

  const { data, error } = await getSupabaseAdmin()
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    throw new HttpError(
      503,
      "Die Adminberechtigung kann gerade nicht sicher geprüft werden.",
      "admin_check_failed",
    );
  }
  return Boolean(data);
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!(await isAdminUser(user)))
    throw new HttpError(
      403,
      "Du hast keinen Zugriff auf diesen Bereich.",
      "forbidden",
    );
  return user;
}
