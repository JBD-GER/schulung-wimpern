import { requireUser } from "@/lib/server/auth";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import {
  createRecoveryProof,
  RECOVERY_COOKIE,
  verifyRecoveryProof,
} from "@/lib/server/recovery";
import { createClient } from "@/lib/supabase/server";
import { passwordUpdateSchema } from "@/lib/validation/account";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    // Validate before consuming the one-time proof. A malformed request must
    // not burn an otherwise valid recovery link.
    const input = passwordUpdateSchema.parse(await readJson(request));
    const cookieStore = await cookies();
    if (
      !(await verifyRecoveryProof(
        cookieStore.get(RECOVERY_COOKIE)?.value,
        user.id,
      ))
    ) {
      throw new HttpError(
        403,
        "Fordere bitte einen neuen Link zum Zurücksetzen an.",
        "reauthentication_required",
      );
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      password: input.password,
    });
    if (error) {
      try {
        cookieStore.set(RECOVERY_COOKIE, await createRecoveryProof(user.id), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/api/auth/password-update",
          maxAge: 10 * 60,
        });
      } catch {
        throw new HttpError(
          503,
          "Das Passwort konnte nicht geändert werden. Fordere bitte einen neuen Link an.",
        );
      }
      return Response.json(
        {
          ok: false,
          message:
            "Das Passwort konnte nicht geändert werden. Bitte versuche es noch einmal.",
        },
        { status: 503, headers: noStoreHeaders() },
      );
    }
    cookieStore.set(RECOVERY_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/password-update",
      maxAge: 0,
    });
    return Response.json(
      { ok: true, message: "Dein Passwort wurde geändert." },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
