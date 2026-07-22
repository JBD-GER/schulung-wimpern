export const CONSENT_COOKIE = "swv_consent";
export const CONSENT_ID_COOKIE = "swv_consent_id";
export const CONSENT_UPDATED_EVENT = "swv:consent-updated";

export type PrivacyConsent = {
  version: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export function serializePrivacyConsent(consent: PrivacyConsent): string {
  // ResponseCookies performs the required HTTP cookie encoding. Returning an
  // already encoded value here would encode "%" a second time and make the
  // browser persist "%257C" instead of the intended field separator.
  return [
    consent.version,
    consent.analytics ? "1" : "0",
    consent.marketing ? "1" : "0",
    consent.updatedAt,
  ].join("|");
}

export function parsePrivacyConsent(
  value: string | null | undefined,
  expectedVersion: string,
): PrivacyConsent | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    // Accept cookies written by the former double-encoding implementation so
    // an existing choice remains valid immediately after this fix ships.
    const normalized = decoded.includes("|")
      ? decoded
      : decodeURIComponent(decoded);
    const fields = normalized.split("|");
    const isLegacyFormat = fields.length === 3;
    const [version, analytics] = fields;
    const marketing = isLegacyFormat ? "0" : fields[2];
    const updatedAt = isLegacyFormat ? fields[2] : fields[3];
    if (
      (!isLegacyFormat && fields.length !== 4) ||
      version !== expectedVersion ||
      !["0", "1"].includes(analytics) ||
      !["0", "1"].includes(marketing) ||
      !updatedAt ||
      Number.isNaN(Date.parse(updatedAt))
    ) {
      return null;
    }
    return {
      version,
      necessary: true,
      analytics: analytics === "1",
      marketing: marketing === "1",
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
