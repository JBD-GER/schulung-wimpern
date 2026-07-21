import { getCurrentUser } from "@/lib/server/auth";
import { observeAuthSession } from "@/lib/server/auth-sessions";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json(
        { authenticated: false, emailVerified: false },
        { headers: noStoreHeaders() },
      );
    }
    const { data: profile, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("first_name,last_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (profileError) {
      throw new HttpError(503, "Das Profil kann gerade nicht geladen werden.");
    }
    await observeAuthSession(request, user.id);
    return Response.json(
      {
        authenticated: true,
        emailVerified: Boolean(user.email_confirmed_at),
        user: {
          id: user.id,
          email: user.email ?? "",
          firstName: profile?.first_name ?? "",
          lastName: profile?.last_name ?? "",
        },
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
