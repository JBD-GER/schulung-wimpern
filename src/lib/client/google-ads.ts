"use client";

import {
  readBrowserPrivacyConsent,
  type PrivacyConsent,
} from "@/lib/privacy-consent";

export const GOOGLE_ADS_CONVERSION_ID = "17687107752";
export const GOOGLE_ADS_TAG_ID = `AW-${GOOGLE_ADS_CONVERSION_ID}`;
export const GOOGLE_ADS_BEGIN_CHECKOUT_LABEL = "buX7COOkzNQcEKix7_FB";
export const GOOGLE_ADS_PURCHASE_LABEL = "sZcaCLWm5tQcEKix7_FB";
export const GOOGLE_ADS_BEGIN_CHECKOUT_DESTINATION = `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_BEGIN_CHECKOUT_LABEL}`;
export const GOOGLE_ADS_PURCHASE_DESTINATION = `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`;

const GOOGLE_ADS_SCRIPT_ID = "swv-google-ads-tag";
const GOOGLE_ADS_SCRIPT_URL = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ADS_TAG_ID)}`;
const DEDUPE_PREFIX = "swv:google-ads:";

type GoogleTagFunction = (...args: unknown[]) => void;
type GoogleAdsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: GoogleTagFunction;
};

type ConversionBase = {
  value: number;
  currency: string;
  eventCallback?: () => void;
};

export type GoogleAdsBeginCheckout = ConversionBase & {
  sessionId: string;
};

export type GoogleAdsPurchase = ConversionBase & {
  transactionId: string;
};

const deniedConsent = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

const conversionConsent = {
  ad_storage: "granted",
  ad_user_data: "granted",
  // Conversion measurement does not require remarketing or personalized ads.
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

let consentDefaultsQueued = false;
let googleAdsConfigured = false;
let consentGranted: boolean | null = null;
let scriptLoadPromise: Promise<boolean> | null = null;
const pendingConversions = new Set<string>();
const memoryDedupe = new Set<string>();

function browserWindow(): GoogleAdsWindow | null {
  return typeof window === "undefined" ? null : (window as GoogleAdsWindow);
}

function configuredConsent(): PrivacyConsent | null {
  const version = process.env.NEXT_PUBLIC_COOKIE_CONSENT_VERSION?.trim() ?? "";
  return version ? readBrowserPrivacyConsent(version) : null;
}

export function hasGoogleAdsConsent(): boolean {
  return configuredConsent()?.marketing === true;
}

export function isGoogleAdsTrackingHost(): boolean {
  const browser = browserWindow();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!browser || !configuredSiteUrl) return false;

  try {
    return new URL(configuredSiteUrl).origin === browser.location.origin;
  } catch {
    return false;
  }
}

function gtag(): GoogleTagFunction | null {
  const browser = browserWindow();
  if (!browser) return null;

  const dataLayer = (browser.dataLayer ??= []);
  browser.gtag ??= (...args: unknown[]) => {
    dataLayer.push(args);
  };
  return browser.gtag;
}

function queueConsentDefaults(tag: GoogleTagFunction): void {
  if (consentDefaultsQueued) return;
  tag("consent", "default", deniedConsent);
  consentDefaultsQueued = true;
}

function queueGoogleAdsConfiguration(tag: GoogleTagFunction): void {
  if (googleAdsConfigured) return;
  tag("js", new Date());
  tag("config", GOOGLE_ADS_TAG_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    send_page_view: false,
  });
  googleAdsConfigured = true;
}

function loadGoogleAdsScript(): Promise<boolean> {
  const browser = browserWindow();
  if (!browser || typeof document === "undefined") {
    return Promise.resolve(false);
  }
  if (scriptLoadPromise) return scriptLoadPromise;

  const existing = document.getElementById(
    GOOGLE_ADS_SCRIPT_ID,
  ) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve(true);

  scriptLoadPromise = new Promise<boolean>((resolve) => {
    const script = existing ?? document.createElement("script");
    let settled = false;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (loaded) {
        script.dataset.loaded = "true";
      } else {
        scriptLoadPromise = null;
        script.remove();
      }
      resolve(loaded);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeout = window.setTimeout(() => finish(false), 8_000);

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.id = GOOGLE_ADS_SCRIPT_ID;
      script.async = true;
      script.src = GOOGLE_ADS_SCRIPT_URL;
      script.dataset.googleAdsTagId = GOOGLE_ADS_TAG_ID;
      document.head.append(script);
    }
  });

  return scriptLoadPromise;
}

function deleteGoogleAdsCookies(): void {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter((name) => name.startsWith("_gcl_"));

  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

function denyGoogleAdsConsent(): void {
  const browser = browserWindow();
  if (browser?.gtag) {
    browser.gtag("consent", "update", deniedConsent);
  }
  consentGranted = false;
  deleteGoogleAdsCookies();
}

/**
 * Synchronizes the Google tag with the persisted website consent. The external
 * script is only requested after explicit marketing/conversion consent.
 */
export async function syncGoogleAdsConsent(
  consent: Pick<PrivacyConsent, "marketing"> | null = configuredConsent(),
): Promise<boolean> {
  if (
    consent?.marketing !== true ||
    !hasGoogleAdsConsent() ||
    !isGoogleAdsTrackingHost()
  ) {
    denyGoogleAdsConsent();
    return false;
  }

  const tag = gtag();
  if (!tag) return false;
  queueConsentDefaults(tag);
  if (consentGranted !== true) {
    tag("consent", "update", conversionConsent);
    consentGranted = true;
  }
  queueGoogleAdsConfiguration(tag);
  return loadGoogleAdsScript();
}

function normalizeConversion(input: ConversionBase): ConversionBase | null {
  const currency = input.currency.trim().toUpperCase();
  if (
    !Number.isFinite(input.value) ||
    input.value <= 0 ||
    input.value > 1_000_000 ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return null;
  }
  return { ...input, currency };
}

function validReference(value: string): boolean {
  return /^[A-Za-z0-9_-]{6,255}$/.test(value);
}

function storageFor(kind: "begin-checkout" | "purchase"): Storage | null {
  const browser = browserWindow();
  if (!browser) return null;
  try {
    return kind === "purchase" ? browser.localStorage : browser.sessionStorage;
  } catch {
    return null;
  }
}

function dedupeKey(
  kind: "begin-checkout" | "purchase",
  reference: string,
): string {
  return `${DEDUPE_PREFIX}${kind}:${reference}`;
}

function wasTracked(
  kind: "begin-checkout" | "purchase",
  reference: string,
): boolean {
  const key = dedupeKey(kind, reference);
  if (memoryDedupe.has(key)) return true;
  try {
    return storageFor(kind)?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markTracked(
  kind: "begin-checkout" | "purchase",
  reference: string,
): void {
  const key = dedupeKey(kind, reference);
  memoryDedupe.add(key);
  try {
    storageFor(kind)?.setItem(key, "1");
  } catch {
    // The in-memory marker still prevents duplicates in restricted browsers.
  }
}

async function trackConversion({
  kind,
  reference,
  destination,
  conversion,
}: {
  kind: "begin-checkout" | "purchase";
  reference: string;
  destination: string;
  conversion: ConversionBase;
}): Promise<boolean> {
  const normalized = normalizeConversion(conversion);
  const key = dedupeKey(kind, reference);
  if (
    !normalized ||
    !validReference(reference) ||
    wasTracked(kind, reference) ||
    pendingConversions.has(key) ||
    !hasGoogleAdsConsent() ||
    !isGoogleAdsTrackingHost()
  ) {
    return false;
  }

  pendingConversions.add(key);
  try {
    if (!(await syncGoogleAdsConsent()) || !hasGoogleAdsConsent()) return false;
    if (wasTracked(kind, reference)) return false;

    const tag = browserWindow()?.gtag;
    if (!tag) return false;
    tag("event", "conversion", {
      send_to: destination,
      value: normalized.value,
      currency: normalized.currency,
      ...(kind === "purchase" ? { transaction_id: reference } : {}),
      ...(normalized.eventCallback
        ? {
            event_callback: normalized.eventCallback,
            event_timeout: 2_000,
          }
        : {}),
    });
    markTracked(kind, reference);
    return true;
  } finally {
    pendingConversions.delete(key);
  }
}

export function trackGoogleAdsBeginCheckout({
  sessionId,
  ...conversion
}: GoogleAdsBeginCheckout): Promise<boolean> {
  return trackConversion({
    kind: "begin-checkout",
    reference: sessionId,
    destination: GOOGLE_ADS_BEGIN_CHECKOUT_DESTINATION,
    conversion,
  });
}

export function trackGoogleAdsPurchase({
  transactionId,
  ...conversion
}: GoogleAdsPurchase): Promise<boolean> {
  return trackConversion({
    kind: "purchase",
    reference: transactionId,
    destination: GOOGLE_ADS_PURCHASE_DESTINATION,
    conversion,
  });
}
