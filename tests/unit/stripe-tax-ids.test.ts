// @vitest-environment node
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { reconcileCustomerTaxIds } from "@/lib/server/stripe-tax-ids";

vi.mock("server-only", () => ({}));

function stripeWithTaxIds(
  rows: Array<{ id: string; type: string; value: string }>,
  hasMore = false,
) {
  let currentRows = [...rows];
  const listTaxIds = vi.fn().mockImplementation(async () => ({
    data: [...currentRows],
    has_more: hasMore,
  }));
  const deleteTaxId = vi.fn().mockImplementation(async (_customerId, taxId) => {
    currentRows = currentRows.filter((row) => row.id !== taxId);
    return { deleted: true };
  });
  const createTaxId = vi
    .fn()
    .mockImplementation(async (_customerId, desired) => {
      currentRows.push({ id: "tax-new", ...desired });
      return { id: "tax-new" };
    });
  const stripe = {
    customers: { listTaxIds, deleteTaxId, createTaxId },
  } as unknown as Pick<Stripe, "customers">;
  return {
    stripe,
    deleteTaxId,
    createTaxId,
    replaceRows(nextRows: typeof rows) {
      currentRows = [...nextRows];
    },
  };
}

describe("Stripe-Steuer-ID-Abgleich unter Checkout-Lease", () => {
  it("entfernt für Privatkäufe alle alten IDs", async () => {
    const api = stripeWithTaxIds([
      { id: "tax-old-1", type: "eu_vat", value: "DE123" },
      { id: "tax-old-2", type: "ch_vat", value: "CHE456" },
    ]);
    await reconcileCustomerTaxIds(api.stripe, "cus_1", null, "order-1-lease-1");
    expect(api.deleteTaxId).toHaveBeenCalledTimes(2);
    expect(api.createTaxId).not.toHaveBeenCalled();
  });

  it("behält eine normalisiert passende ID und entfernt Duplikate", async () => {
    const api = stripeWithTaxIds([
      { id: "tax-keep", type: "eu_vat", value: "DE123456" },
      { id: "tax-duplicate", type: "eu_vat", value: "DE 123.456" },
      { id: "tax-other", type: "ch_vat", value: "CHE999" },
    ]);
    await reconcileCustomerTaxIds(
      api.stripe,
      "cus_1",
      { type: "eu_vat", value: "de-123.456" },
      "order-1-lease-1",
    );
    expect(api.deleteTaxId).toHaveBeenCalledTimes(2);
    expect(api.createTaxId).not.toHaveBeenCalled();
  });

  it("ersetzt eine abweichende ID und bricht bei unvollständiger Liste ab", async () => {
    const api = stripeWithTaxIds([
      { id: "tax-old", type: "eu_vat", value: "DE111" },
    ]);
    await reconcileCustomerTaxIds(
      api.stripe,
      "cus_1",
      { type: "eu_vat", value: "DE222" },
      "order-1-lease-1",
    );
    expect(api.deleteTaxId).toHaveBeenCalledWith("cus_1", "tax-old", {
      idempotencyKey: "checkout-tax-delete-order-1-lease-1-tax-old",
    });
    expect(api.createTaxId).toHaveBeenCalledWith(
      "cus_1",
      { type: "eu_vat", value: "DE222" },
      { idempotencyKey: "checkout-tax-create-order-1-lease-1" },
    );

    const paginated = stripeWithTaxIds([], true);
    await expect(
      reconcileCustomerTaxIds(
        paginated.stripe,
        "cus_1",
        null,
        "order-2-lease-1",
      ),
    ).rejects.toThrow(/too many/i);
  });

  it("stellt A nach A→B→A mit einer neuen Mutationsgeneration tatsächlich wieder her", async () => {
    const api = stripeWithTaxIds([
      { id: "tax-a", type: "eu_vat", value: "DE111" },
    ]);
    await reconcileCustomerTaxIds(
      api.stripe,
      "cus_1",
      { type: "eu_vat", value: "DE222" },
      "order-b-lease-1",
    );
    await reconcileCustomerTaxIds(
      api.stripe,
      "cus_1",
      { type: "eu_vat", value: "DE111" },
      "order-a2-lease-2",
    );

    expect(api.createTaxId).toHaveBeenNthCalledWith(
      2,
      "cus_1",
      { type: "eu_vat", value: "DE111" },
      { idempotencyKey: "checkout-tax-create-order-a2-lease-2" },
    );
  });

  it("akzeptiert eine verlorene Mutationsantwort nur nach Live-Verifikation", async () => {
    const api = stripeWithTaxIds([
      { id: "tax-old", type: "eu_vat", value: "DE111" },
    ]);
    api.deleteTaxId.mockImplementationOnce(async () => {
      // Simulate Stripe having deleted the ID before the response is lost.
      api.replaceRows([]);
      throw new Error("connection lost after mutation");
    });

    await expect(
      reconcileCustomerTaxIds(api.stripe, "cus_1", null, "order-1-lease-1"),
    ).resolves.toBeUndefined();
  });
});
