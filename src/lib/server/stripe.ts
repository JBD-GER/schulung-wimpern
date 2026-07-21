import "server-only";

import Stripe from "stripe";

import { requireEnv } from "@/lib/env";

export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

let stripeClient: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: STRIPE_API_VERSION,
      appInfo: { name: "schulung-wimpernverlaengerung.de", version: "1.0.0" },
      maxNetworkRetries: 2,
      timeout: 20_000,
      telemetry: false,
    });
  }
  return stripeClient;
}
