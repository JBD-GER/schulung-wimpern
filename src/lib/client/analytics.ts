"use client";

import { track } from "@vercel/analytics";
import { readBrowserPrivacyConsent } from "@/lib/privacy-consent";

export function trackEvent(name: string): void {
  const version = process.env.NEXT_PUBLIC_COOKIE_CONSENT_VERSION ?? "";
  if (!version || !readBrowserPrivacyConsent(version)?.analytics) return;
  track(name);
}
