export const CONSENT_COOKIE = "swv_consent";
export const CONSENT_ID_COOKIE = "swv_consent_id";
export const CONSENT_UPDATED_EVENT = "swv:consent-updated";

export type PrivacyConsent = {
  version: string;
  necessary: true;
  analytics: boolean;
  marketing: false;
  updatedAt: string;
};

export function serializePrivacyConsent(consent: PrivacyConsent): string {
  return encodeURIComponent(
    [consent.version, consent.analytics ? "1" : "0", consent.updatedAt].join(
      "|",
    ),
  );
}

export function parsePrivacyConsent(
  value: string | null | undefined,
  expectedVersion: string,
): PrivacyConsent | null {
  if (!value) return null;
  try {
    const [version, analytics, updatedAt, extra] =
      decodeURIComponent(value).split("|");
    if (
      extra !== undefined ||
      version !== expectedVersion ||
      !["0", "1"].includes(analytics) ||
      !updatedAt ||
      Number.isNaN(Date.parse(updatedAt))
    ) {
      return null;
    }
    return {
      version,
      necessary: true,
      analytics: analytics === "1",
      marketing: false,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function readBrowserPrivacyConsent(
  expectedVersion: string,
): PrivacyConsent | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  return parsePrivacyConsent(raw, expectedVersion);
}
