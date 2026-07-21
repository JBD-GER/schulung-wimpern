import {
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { observeAuthSession } from "@/lib/server/auth-sessions";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/account";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = loginSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "auth-login",
      subject: `${requestSubject(request)}:${input.email}`,
      maximum: 8,
      windowSeconds: 900,
    });
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(input);
    if (error || !data.user || !data.session) {
      return Response.json(
        {
          ok: false,
          message: "E-Mail-Adresse oder Passwort ist nicht korrekt.",
        },
        { status: 401, headers: noStoreHeaders() },
      );
    }
    try {
      await observeAuthSession(request, data.user.id, data.session);
    } catch {
      // Authentication remains authoritative in Supabase. The session endpoint
      // retries the local device overview without turning a valid login into a
      // misleading failure after cookies have already been issued.
    }
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
