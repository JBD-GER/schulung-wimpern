import "server-only";

import { hash } from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * Produces a Supabase-compatible one-way password hash. Only this hash is
 * retained while Stripe is open; the plaintext password is never persisted,
 * logged, attached to Stripe metadata, or included in checkout snapshots.
 */
export async function hashCheckoutPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}
