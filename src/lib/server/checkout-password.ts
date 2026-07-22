import "server-only";

import { compare, hash } from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * Produces a Supabase-compatible one-way password hash. Only this hash is
 * retained while Stripe is open; the plaintext password is never persisted,
 * logged, attached to Stripe metadata, or included in checkout snapshots.
 */
export async function hashCheckoutPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/**
 * Verifies that a browser which still owns an unpaid checkout also knows the
 * password chosen for it. This lets the server resume the cookie-bound intent
 * without ever retaining or returning the plaintext password.
 */
export async function verifyCheckoutPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}
