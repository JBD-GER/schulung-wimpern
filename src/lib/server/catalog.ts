import "server-only";

import type Stripe from "stripe";

import { requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { HttpError } from "./http";
import { getReleaseContract } from "./release";
import { getStripe } from "./stripe";

export interface PublicProduct {
  name: string;
  unitAmount: number | null;
  currency: string;
  taxBehavior: string | null;
  available: boolean;
}

export interface StripeProduct extends PublicProduct {
  productId: string;
  priceId: string;
  unitAmount: number;
  available: true;
}

async function isCourseReadyForSale(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: course, error } = await admin
    .from("courses")
    .select("id,status")
    .eq("slug", "online-schulung-wimpernverlaengerung")
    .maybeSingle();
  if (error || !course || course.status !== "published") return false;
  const { data, error: checkError } = await admin.rpc(
    "assert_course_quiz_publishable",
    {
      check_course_id: course.id,
    },
  );
  return !checkError && data === true;
}

export async function requireStripeProduct(): Promise<StripeProduct> {
  if (!getReleaseContract().readyForSale) {
    throw new HttpError(
      503,
      "Der Kurs befindet sich noch in der redaktionellen Freigabe und ist derzeit nicht buchbar.",
      "course_not_approved",
    );
  }
  const configuredProductId = requireEnv("STRIPE_PRODUCT_ID");
  const configuredPriceId = requireEnv("STRIPE_PRICE_ID");
  const price = await getStripe().prices.retrieve(configuredPriceId, {
    expand: ["product"],
  });

  if (
    !price.active ||
    price.type !== "one_time" ||
    price.unit_amount === null
  ) {
    throw new HttpError(
      503,
      "Das Produkt ist derzeit nicht kaufbar.",
      "product_unavailable",
    );
  }
  if (typeof price.product === "string" || price.product.deleted) {
    throw new HttpError(
      503,
      "Die Produktinformationen sind derzeit nicht verfügbar.",
      "product_unavailable",
    );
  }
  if (price.product.id !== configuredProductId || !price.product.active) {
    throw new HttpError(
      503,
      "Die Produktkonfiguration ist nicht gültig.",
      "product_misconfigured",
    );
  }
  const activePrices = await getStripe().prices.list({
    product: configuredProductId,
    active: true,
    limit: 2,
  });
  if (
    activePrices.data.length !== 1 ||
    activePrices.data[0]?.id !== configuredPriceId
  ) {
    throw new HttpError(
      503,
      "Für das Kursprodukt muss exakt der konfigurierte Preis aktiv sein.",
      "product_misconfigured",
    );
  }
  if (!(await isCourseReadyForSale())) {
    throw new HttpError(
      503,
      "Der Kurs befindet sich noch in der redaktionellen Freigabe und ist derzeit nicht buchbar.",
      "course_not_approved",
    );
  }

  return {
    productId: price.product.id,
    priceId: price.id,
    name: price.product.name,
    unitAmount: price.unit_amount,
    currency: price.currency.toLowerCase(),
    taxBehavior: price.tax_behavior satisfies Stripe.Price.TaxBehavior | null,
    available: true,
  };
}

export async function getPublicProduct(): Promise<PublicProduct> {
  try {
    return await requireStripeProduct();
  } catch {
    // No synthetic price or currency is returned. This keeps builds possible
    // before secrets are injected while preventing an unapproved course sale.
    return {
      name: "",
      unitAmount: null,
      currency: "",
      taxBehavior: null,
      available: false,
    };
  }
}
