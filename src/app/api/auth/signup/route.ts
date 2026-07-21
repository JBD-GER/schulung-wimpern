import { getSiteUrl } from "@/lib/env";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation/account";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = signupSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "auth-signup",
      subject: `${requestSubject(request)}:${input.email}`,
      maximum: 5,
      windowSeconds: 3600,
    });
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/api/auth/callback?next=/checkout`,
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          certificate_name:
            input.certificateName ?? `${input.firstName} ${input.lastName}`,
        },
      },
    });
    if (error) {
      // Intentionally indistinguishable from the success response to prevent
      // account enumeration through status, timing-relevant branches or IDs.
    }
    return Response.json(
      {
        ok: true,
        emailVerificationRequired: true,
        message:
          "Wenn die Adresse verwendet werden kann, erhältst du gleich eine E-Mail zur Bestätigung.",
      },
      { status: 200, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
