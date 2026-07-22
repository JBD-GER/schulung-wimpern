import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_COOKIE,
  serializePrivacyConsent,
  type PrivacyConsent,
} from "@/lib/privacy-consent";

type GoogleAdsBrowser = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const consent: PrivacyConsent = {
  version: "cookies-google-ads-v1",
  necessary: true,
  analytics: false,
  marketing: true,
  updatedAt: "2026-07-22T10:00:00.000Z",
};

function setConsent(marketing: boolean): void {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    serializePrivacyConsent({ ...consent, marketing }),
  )}; Path=/; SameSite=Lax`;
}

function commands(): unknown[][] {
  return ((window as GoogleAdsBrowser).dataLayer ?? []) as unknown[][];
}

function finishScriptLoad(): void {
  const script = document.getElementById("swv-google-ads-tag");
  expect(script).toBeInstanceOf(HTMLScriptElement);
  script?.dispatchEvent(new Event("load"));
}

describe("Google Ads Conversion-Tracking", () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = "";
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete (window as GoogleAdsBrowser).dataLayer;
    delete (window as GoogleAdsBrowser).gtag;
    vi.stubEnv("NEXT_PUBLIC_COOKIE_CONSENT_VERSION", consent.version);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", window.location.origin);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lädt ohne Marketing-Einwilligung weder Google noch eine Conversion", async () => {
    const { trackGoogleAdsBeginCheckout } =
      await import("@/lib/client/google-ads");

    await expect(
      trackGoogleAdsBeginCheckout({
        sessionId: "cs_live_ohne_einwilligung",
        value: 149,
        currency: "EUR",
      }),
    ).resolves.toBe(false);
    expect(document.getElementById("swv-google-ads-tag")).toBeNull();
    expect((window as GoogleAdsBrowser).dataLayer).toBeUndefined();
  });

  it("setzt Consent Mode v2 vor dem einmaligen Laden des Google-Tags", async () => {
    setConsent(true);
    const { GOOGLE_ADS_TAG_ID, syncGoogleAdsConsent } =
      await import("@/lib/client/google-ads");

    const firstLoad = syncGoogleAdsConsent();
    const script = document.getElementById(
      "swv-google-ads-tag",
    ) as HTMLScriptElement | null;
    expect(script?.src).toBe(
      `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_TAG_ID}`,
    );
    expect(commands()[0]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(commands()[1]).toEqual([
      "consent",
      "update",
      {
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);

    finishScriptLoad();
    await expect(firstLoad).resolves.toBe(true);
    await expect(syncGoogleAdsConsent()).resolves.toBe(true);
    expect(document.querySelectorAll("#swv-google-ads-tag")).toHaveLength(1);
  });

  it("sendet den Checkout-Start höchstens einmal pro Stripe-Sitzung", async () => {
    setConsent(true);
    const {
      GOOGLE_ADS_BEGIN_CHECKOUT_DESTINATION,
      syncGoogleAdsConsent,
      trackGoogleAdsBeginCheckout,
    } = await import("@/lib/client/google-ads");
    const ready = syncGoogleAdsConsent();
    finishScriptLoad();
    await ready;

    const conversion = {
      sessionId: "cs_live_checkout_123456",
      value: 149,
      currency: "eur",
    };
    await expect(trackGoogleAdsBeginCheckout(conversion)).resolves.toBe(true);
    await expect(trackGoogleAdsBeginCheckout(conversion)).resolves.toBe(false);

    vi.resetModules();
    const reloadedTracking = await import("@/lib/client/google-ads");
    await expect(
      reloadedTracking.trackGoogleAdsBeginCheckout(conversion),
    ).resolves.toBe(false);

    const events = commands().filter(
      (command) => command[0] === "event" && command[1] === "conversion",
    );
    expect(events).toEqual([
      [
        "event",
        "conversion",
        {
          send_to: GOOGLE_ADS_BEGIN_CHECKOUT_DESTINATION,
          value: 149,
          currency: "EUR",
        },
      ],
    ]);
  });

  it("sendet den serverseitigen Auftragswert als deduplizierten Kauf", async () => {
    setConsent(true);
    const {
      GOOGLE_ADS_PURCHASE_DESTINATION,
      syncGoogleAdsConsent,
      trackGoogleAdsPurchase,
    } = await import("@/lib/client/google-ads");
    const ready = syncGoogleAdsConsent();
    finishScriptLoad();
    await ready;

    const conversion = {
      transactionId: "e6cfa4a3-03e2-4c0c-8301-fa973760e672",
      value: 149,
      currency: "EUR",
    };
    await expect(trackGoogleAdsPurchase(conversion)).resolves.toBe(true);
    await expect(trackGoogleAdsPurchase(conversion)).resolves.toBe(false);

    vi.resetModules();
    const reloadedTracking = await import("@/lib/client/google-ads");
    await expect(
      reloadedTracking.trackGoogleAdsPurchase(conversion),
    ).resolves.toBe(false);

    expect(commands()).toContainEqual([
      "event",
      "conversion",
      {
        send_to: GOOGLE_ADS_PURCHASE_DESTINATION,
        value: 149,
        currency: "EUR",
        transaction_id: conversion.transactionId,
      },
    ]);
  });

  it("stoppt Events nach Widerruf der Marketing-Einwilligung", async () => {
    setConsent(true);
    const { syncGoogleAdsConsent, trackGoogleAdsPurchase } =
      await import("@/lib/client/google-ads");
    const ready = syncGoogleAdsConsent();
    finishScriptLoad();
    await ready;

    document.cookie = "_gcl_aw=tracking-cookie; Path=/";
    setConsent(false);
    await expect(syncGoogleAdsConsent({ marketing: false })).resolves.toBe(
      false,
    );
    await expect(
      trackGoogleAdsPurchase({
        transactionId: "e6cfa4a3-03e2-4c0c-8301-fa973760e673",
        value: 149,
        currency: "EUR",
      }),
    ).resolves.toBe(false);

    expect(commands()).toContainEqual([
      "consent",
      "update",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(document.cookie).not.toContain("_gcl_aw=");
    expect(
      commands().filter(
        (command) => command[0] === "event" && command[1] === "conversion",
      ),
    ).toHaveLength(0);
  });
});
