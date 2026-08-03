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
  return ((window as GoogleAdsBrowser).dataLayer ?? []).map((command) =>
    Array.from(command as ArrayLike<unknown>),
  );
}

function finishScriptLoad(): void {
  const script = document.getElementById("swv-google-ads-tag");
  expect(script).toBeInstanceOf(HTMLScriptElement);
  script?.dispatchEvent(new Event("load"));
}

function installGoogleTagProcessor(): void {
  const browser = window as GoogleAdsBrowser;
  browser.gtag = (...args: unknown[]) => {
    (browser.dataLayer ??= []).push(args);
    if (args[0] !== "event" || args[1] !== "conversion") return;
    const parameters = args[2] as { event_callback?: () => void };
    queueMicrotask(() => parameters.event_callback?.());
  };
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
    const rawCommands = (window as GoogleAdsBrowser).dataLayer ?? [];
    expect(rawCommands).not.toHaveLength(0);
    expect(Array.isArray(rawCommands[0])).toBe(false);
    expect(Object.prototype.toString.call(rawCommands[0])).toBe(
      "[object Arguments]",
    );
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
    installGoogleTagProcessor();

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
    expect(events).toHaveLength(1);
    expect(events[0]?.slice(0, 2)).toEqual(["event", "conversion"]);
    expect(events[0]?.[2]).toEqual(
      expect.objectContaining({
        send_to: GOOGLE_ADS_BEGIN_CHECKOUT_DESTINATION,
        value: 149,
        currency: "EUR",
        event_callback: expect.any(Function),
        event_timeout: 2_000,
      }),
    );
  });

  it("wiederholt Conversions, die der fehlerhafte v1-Client nur lokal markiert hatte", async () => {
    setConsent(true);
    const { syncGoogleAdsConsent, trackGoogleAdsBeginCheckout } =
      await import("@/lib/client/google-ads");
    const ready = syncGoogleAdsConsent();
    finishScriptLoad();
    await ready;
    installGoogleTagProcessor();

    const sessionId = "cs_live_v1_retry_123456";
    window.sessionStorage.setItem(
      `swv:google-ads:begin-checkout:${sessionId}`,
      "1",
    );

    await expect(
      trackGoogleAdsBeginCheckout({
        sessionId,
        value: 149,
        currency: "EUR",
      }),
    ).resolves.toBe(true);
    expect(
      window.sessionStorage.getItem(
        `swv:google-ads:v2:begin-checkout:${sessionId}`,
      ),
    ).toBe("1");
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
    installGoogleTagProcessor();

    const conversion = {
      transactionId: "e6cfa4a3-03e2-4c0c-8301-fa973760e672",
      value: 149,
      currency: "EUR",
      eventCallback: vi.fn(),
    };
    await expect(trackGoogleAdsPurchase(conversion)).resolves.toBe(true);
    await expect(trackGoogleAdsPurchase(conversion)).resolves.toBe(false);

    vi.resetModules();
    const reloadedTracking = await import("@/lib/client/google-ads");
    await expect(
      reloadedTracking.trackGoogleAdsPurchase(conversion),
    ).resolves.toBe(false);

    const event = commands().find(
      (command) => command[0] === "event" && command[1] === "conversion",
    );
    expect(event?.slice(0, 2)).toEqual(["event", "conversion"]);
    expect(event?.[2]).toEqual(
      expect.objectContaining({
        send_to: GOOGLE_ADS_PURCHASE_DESTINATION,
        value: 149,
        currency: "EUR",
        transaction_id: conversion.transactionId,
        event_callback: expect.any(Function),
        event_timeout: 2_000,
      }),
    );
    expect(conversion.eventCallback).toHaveBeenCalledOnce();
  });

  it("erlaubt nach einem nicht verarbeiteten Google-Befehl einen sicheren Retry", async () => {
    setConsent(true);
    const { syncGoogleAdsConsent, trackGoogleAdsBeginCheckout } =
      await import("@/lib/client/google-ads");
    const ready = syncGoogleAdsConsent();
    finishScriptLoad();
    await ready;
    vi.useFakeTimers();

    try {
      const conversion = {
        sessionId: "cs_live_retry_123456",
        value: 149,
        currency: "EUR",
      };
      const ignoredAttempt = trackGoogleAdsBeginCheckout(conversion);
      await vi.advanceTimersByTimeAsync(2_250);
      await expect(ignoredAttempt).resolves.toBe(false);

      installGoogleTagProcessor();
      await expect(trackGoogleAdsBeginCheckout(conversion)).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
