"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import { BarChart3, Check, ChevronDown, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/client/analytics";
import {
  CONSENT_UPDATED_EVENT,
  readBrowserPrivacyConsent,
  type PrivacyConsent,
} from "@/lib/privacy-consent";

type ConsentContextValue = {
  consent: PrivacyConsent | null;
  saving: boolean;
  error: string | null;
  saveConsent: (analytics: boolean) => Promise<boolean>;
  openSettings: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

const privatePaths = [
  "/admin",
  "/dashboard",
  "/profil",
  "/schulung",
  "/zertifikat",
  "/checkout",
  "/zahlung-erfolgreich",
  "/login",
  "/passwort-",
];

const anonymizedFunnelPaths = ["/checkout", "/zahlung-erfolgreich"];

export function protectAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    const privatePath = privatePaths.some((path) =>
      url.pathname.startsWith(path),
    );
    if (privatePath) {
      const funnelPath = anonymizedFunnelPaths.find((path) =>
        url.pathname.startsWith(path),
      );
      if (event.type === "pageview" || !funnelPath) return null;
      url.pathname = funnelPath;
    }
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}

export function usePrivacyConsent(): ConsentContextValue {
  const value = useContext(ConsentContext);
  if (!value) throw new Error("usePrivacyConsent requires the ConsentManager.");
  return value;
}

export function ConsentManager({
  version,
  children,
}: {
  version: string;
  children: ReactNode;
}) {
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [analyticsChoice, setAnalyticsChoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readBrowserPrivacyConsent(version);
      setConsent(stored);
      setAnalyticsChoice(stored?.analytics ?? false);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [version]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href="/checkout"]');
      if (!link) return;
      trackEvent("checkout_cta_clicked");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const saveConsent = useCallback(
    async (analytics: boolean) => {
      setSaving(true);
      setError(null);
      try {
        const response = await fetch("/api/privacy/consent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ analytics, marketing: false, version }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          consent?: PrivacyConsent;
          message?: string;
        };
        if (!response.ok || !data.consent) {
          throw new Error(
            data.message ??
              "Deine Auswahl konnte gerade nicht gespeichert werden.",
          );
        }
        setConsent(data.consent);
        setAnalyticsChoice(data.consent.analytics);
        setSettingsOpen(false);
        window.dispatchEvent(
          new CustomEvent(CONSENT_UPDATED_EVENT, { detail: data.consent }),
        );
        return true;
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Deine Auswahl konnte gerade nicht gespeichert werden.",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [version],
  );

  const openSettings = useCallback(() => {
    setAnalyticsChoice(consent?.analytics ?? false);
    setDetailsOpen(true);
    setSettingsOpen(true);
  }, [consent]);

  const consentAwareBeforeSend = useCallback(
    (event: BeforeSendEvent) => {
      if (!readBrowserPrivacyConsent(version)?.analytics) return null;
      return protectAnalyticsEvent(event);
    },
    [version],
  );

  const bannerVisible = loaded && (!consent || settingsOpen);

  return (
    <ConsentContext.Provider
      value={{ consent, saving, error, saveConsent, openSettings }}
    >
      {children}
      {consent?.analytics ? (
        <Analytics beforeSend={consentAwareBeforeSend} />
      ) : null}
      {bannerVisible ? (
        <section
          className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-4xl rounded-3xl border border-line bg-white p-5 shadow-[0_24px_80px_rgba(29,39,51,.24)] sm:inset-x-5 sm:bottom-5 sm:p-7"
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-title"
          aria-describedby="consent-description"
        >
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-navy text-white">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="consent-title"
                    className="font-serif text-2xl font-semibold text-navy"
                  >
                    Deine Privatsphäre
                  </h2>
                  <p
                    id="consent-description"
                    className="mt-2 max-w-2xl text-sm leading-6 text-muted"
                  >
                    Notwendige Speicherungen sichern Login und Checkout. Mit
                    deiner freiwilligen Zustimmung hilft uns anonyme Vercel Web
                    Analytics, die öffentliche Website und den Buchungsablauf zu
                    verbessern. Persönliche Kursseiten werden nicht gemessen.
                  </p>
                </div>
                {consent ? (
                  <button
                    type="button"
                    aria-label="Cookie-Einstellungen schließen"
                    className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-ivory hover:text-navy"
                    onClick={() => setSettingsOpen(false)}
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="mt-4 flex items-center gap-2 text-sm font-bold text-navy"
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((current) => !current)}
              >
                Auswahl anpassen
                <ChevronDown
                  className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {detailsOpen ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-line bg-ivory/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-navy">
                      <Check
                        className="size-4 text-success"
                        aria-hidden="true"
                      />
                      Notwendig
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      Einwilligungsauswahl, Sicherheit, Anmeldung und der von
                      dir aufgerufene Stripe-Checkout. Immer aktiv.
                    </p>
                  </div>
                  <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-white p-4">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 accent-navy"
                      checked={analyticsChoice}
                      onChange={(event) =>
                        setAnalyticsChoice(event.target.checked)
                      }
                    />
                    <span>
                      <span className="flex items-center gap-2 text-sm font-bold text-navy">
                        <BarChart3
                          className="size-4 text-gold"
                          aria-hidden="true"
                        />
                        Anonyme Statistik
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        Öffentliche Seitenaufrufe und anonyme Funnel-Ereignisse
                        über Vercel; keine Werbeprofile.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}

              {error ? (
                <p
                  className="mt-4 text-sm font-semibold text-danger"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {detailsOpen ? (
                  <Button
                    onClick={() => void saveConsent(analyticsChoice)}
                    disabled={saving}
                  >
                    Auswahl speichern
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void saveConsent(true)}
                    disabled={saving}
                  >
                    Alle akzeptieren
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void saveConsent(false)}
                  disabled={saving}
                >
                  Nur notwendige
                </Button>
                <Link
                  href="/datenschutz#cookie-einstellungen"
                  className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-bold text-navy underline decoration-gold underline-offset-4"
                >
                  Datenschutzhinweise
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </ConsentContext.Provider>
  );
}
