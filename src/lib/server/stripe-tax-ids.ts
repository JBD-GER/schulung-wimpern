import "server-only";

import type Stripe from "stripe";

import { normalizeTaxId } from "@/lib/billing-fingerprint";

export async function reconcileCustomerTaxIds(
  stripe: Pick<Stripe, "customers">,
  customerId: string,
  desired: Stripe.CustomerCreateTaxIdParams | null,
  mutationKey: string,
  beforeOperation?: () => Promise<void>,
): Promise<void> {
  await beforeOperation?.();
  const existing = await stripe.customers.listTaxIds(customerId, {
    limit: 100,
  });
  if (existing.has_more) {
    throw new Error("Too many Stripe tax IDs to reconcile safely.");
  }

  let mutationError: unknown;
  try {
    let retainedMatchingId = false;
    for (const taxId of existing.data) {
      const matches =
        desired !== null &&
        taxId.type === desired.type &&
        normalizeTaxId(taxId.value) === normalizeTaxId(desired.value);
      if (matches && !retainedMatchingId) {
        retainedMatchingId = true;
        continue;
      }
      await beforeOperation?.();
      await stripe.customers.deleteTaxId(customerId, taxId.id, {
        idempotencyKey: `checkout-tax-delete-${mutationKey}-${taxId.id}`,
      });
    }

    if (desired && !retainedMatchingId) {
      await beforeOperation?.();
      await stripe.customers.createTaxId(customerId, desired, {
        idempotencyKey: `checkout-tax-create-${mutationKey}`,
      });
    }
  } catch (error) {
    // Stripe may have applied a mutation even when its response was lost or a
    // 5xx was returned. Verify the live collection before failing closed.
    mutationError = error;
  }

  let verified;
  await beforeOperation?.();
  try {
    verified = await stripe.customers.listTaxIds(customerId, { limit: 100 });
  } catch (error) {
    throw mutationError ?? error;
  }
  if (verified.has_more) {
    throw new Error("Too many Stripe tax IDs to verify safely.");
  }
  const matchesDesired = desired
    ? verified.data.length === 1 &&
      verified.data[0]?.type === desired.type &&
      normalizeTaxId(verified.data[0].value) === normalizeTaxId(desired.value)
    : verified.data.length === 0;
  if (!matchesDesired) {
    throw (
      mutationError ??
      new Error("Stripe tax ID reconciliation could not be verified.")
    );
  }
}
