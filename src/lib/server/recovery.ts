import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { getServerSupabaseConfig } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const RECOVERY_COOKIE = "swv-recovery-verification";

export async function createRecoveryProof(userId: string): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const { error } = await getSupabaseAdmin()
    .from("auth_recovery_proofs")
    .insert({
      user_id: userId,
      nonce_hash: createHash("sha256").update(nonce).digest("hex"),
      expires_at: new Date(expiresAt).toISOString(),
    });
  if (error)
    throw new Error(
      "Der Wiederherstellungsnachweis konnte nicht gespeichert werden.",
    );
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt, nonce }),
  ).toString("base64url");
  const signature = createHmac(
    "sha256",
    getServerSupabaseConfig().serviceRoleKey,
  )
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export async function verifyRecoveryProof(
  token: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac(
    "sha256",
    getServerSupabaseConfig().serviceRoleKey,
  )
    .update(payload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  )
    return false;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      userId?: string;
      expiresAt?: number;
      nonce?: string;
    };
    if (
      decoded.userId !== userId ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= Date.now() ||
      typeof decoded.nonce !== "string"
    )
      return false;
    const { data, error } = await getSupabaseAdmin().rpc(
      "consume_recovery_proof",
      {
        proof_user_id: userId,
        proof_nonce_hash: createHash("sha256")
          .update(decoded.nonce)
          .digest("hex"),
      },
    );
    return !error && data === true;
  } catch {
    return false;
  }
}
