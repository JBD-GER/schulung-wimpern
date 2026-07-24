"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { trackEvent } from "@/lib/client/analytics";
import { trackGoogleAdsPurchase } from "@/lib/client/google-ads";
import { formatPrice } from "@/lib/utils";

type Status =
  | "pending"
  | "active"
  | "failed"
  | "delayed"
  | "revoked"
  | "recovery"
  | "cancelled";

const MAX_POLLING_MILLISECONDS = 5 * 60 * 1000;
const MAX_POLL_ATTEMPTS = 60;
const REQUEST_TIMEOUT_MILLISECONDS = 12_000;
const SUCCESS_REDIRECT_DELAY_MILLISECONDS = 2_700;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OrderConfirmation = {
  transactionId: string;
  productName: string;
  amountTotal: number;
  currency: string;
  taxAmount: number | null;
};

function readOrderConfirmation(value: unknown): OrderConfirmation | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  if (
    typeof order.transactionId !== "string" ||
    !UUID_PATTERN.test(order.transactionId) ||
    typeof order.productName !== "string" ||
    order.productName.trim().length === 0 ||
    typeof order.amountTotal !== "number" ||
    !Number.isSafeInteger(order.amountTotal) ||
    order.amountTotal < 0 ||
    typeof order.currency !== "string" ||
    !/^[a-z]{3}$/i.test(order.currency) ||
    !(
      order.taxAmount === null ||
      (typeof order.taxAmount === "number" &&
        Number.isSafeInteger(order.taxAmount) &&
        order.taxAmount >= 0)
    )
  )
    return null;
  return {
    transactionId: order.transactionId,
    productName: order.productName,
    amountTotal: order.amountTotal,
    currency: order.currency.toUpperCase(),
    taxAmount: order.taxAmount,
  };
}

export function PaymentStatus() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<Status>(
    sessionId ? "pending" : "failed",
  );
  const [order, setOrder] = useState<OrderConfirmation | null>(null);
  const [duplicatePayment, setDuplicatePayment] = useState(false);
  const [message, setMessage] = useState(
    sessionId
      ? "Deine Zahlung wird gerade bestätigt."
      : "Diese Zahlungsbestätigung ist unvollständig. Dein Zugang wurde dadurch nicht freigeschaltet.",
  );

  useEffect(() => {
    if (!sessionId) return;

    let finished = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let activeController: AbortController | undefined;
    let attempts = 0;

    const stopPolling = (abortRequest = false) => {
      finished = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (requestTimer) clearTimeout(requestTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (abortRequest) activeController?.abort();
      activeController = undefined;
    };
    const markDelayed = () => {
      if (finished) return;
      stopPolling(true);
      setStatus("delayed");
      trackEvent("checkout_confirmation_delayed");
      setMessage(
        "Die Bestätigung dauert länger als erwartet. Bitte starte keine zweite Zahlung: Ein später eintreffender Stripe-Webhook aktiviert deinen Zugang weiterhin automatisch und du erhältst eine E-Mail. Prüfe dein Dashboard später erneut oder kontaktiere den Support.",
      );
    };
    const scheduleNext = (check: () => Promise<void>) => {
      if (finished) return;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        markDelayed();
        return;
      }
      const delay = Math.min(1_800 * 1.16 ** attempts, 10_000);
      pollTimer = setTimeout(() => void check(), delay);
    };
    const check = async () => {
      if (finished) return;
      attempts += 1;
      activeController = new AbortController();
      const requestController = activeController;
      requestTimer = setTimeout(
        () => requestController.abort(),
        REQUEST_TIMEOUT_MILLISECONDS,
      );
      try {
        let response = await fetch("/api/checkout/intent/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
          cache: "no-store",
          signal: requestController.signal,
        });
        let data = (await response.json().catch(() => ({}))) as {
          status?: Status;
          message?: string;
          error?: string;
          redirectUrl?: string;
          duplicatePayment?: boolean;
          order?: unknown;
        };
        if (
          !response.ok &&
          [
            "checkout_intent_required",
            "checkout_intent_invalid",
            "checkout_session_not_found",
          ].includes(data.error ?? "")
        ) {
          response = await fetch(
            `/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`,
            { cache: "no-store", signal: requestController.signal },
          );
          data = (await response.json().catch(() => ({}))) as typeof data;
        }
        if (finished) return;
        if (
          response.ok &&
          data.status === "cancelled" &&
          data.redirectUrl?.startsWith(
            "/checkout?payment=cancelled&resume=payment",
          )
        ) {
          stopPolling();
          trackEvent("checkout_cancelled");
          router.replace(data.redirectUrl);
          return;
        }
        if (response.ok && data.status === "active") {
          const confirmedOrder = readOrderConfirmation(data.order);
          if (!confirmedOrder) {
            stopPolling();
            setStatus("failed");
            setMessage(
              "Die Zahlung wurde bestätigt, aber die Bestelldaten konnten nicht sicher geladen werden. Bitte öffne dein Dashboard oder kontaktiere den Support.",
            );
            return;
          }
          stopPolling();
          setOrder(confirmedOrder);
          setDuplicatePayment(data.duplicatePayment === true);
          setStatus("active");
          trackEvent("checkout_payment_confirmed");
          setMessage(
            data.message ??
              "Deine Zahlung ist bestätigt und dein Schulungsplatz ist freigeschaltet. Prüfe hier noch einmal deine Bestelldaten.",
          );
          if (data.duplicatePayment !== true) {
            void trackGoogleAdsPurchase({
              transactionId: confirmedOrder.transactionId,
              value: confirmedOrder.amountTotal / 100,
              currency: confirmedOrder.currency,
            }).catch(() => undefined);
            redirectTimer = setTimeout(
              () => router.replace("/dashboard"),
              SUCCESS_REDIRECT_DELAY_MILLISECONDS,
            );
          }
          return;
        }
        if (data.status === "failed" || data.status === "revoked") {
          stopPolling();
          setStatus(data.status);
          setMessage(
            data.message ??
              (data.status === "revoked"
                ? "Der Kurszugang zu dieser Zahlung wurde gesperrt. Bitte kontaktiere den Support."
                : "Die Zahlung konnte nicht bestätigt werden. Es wurde kein Schulungszugang freigeschaltet."),
          );
          if (data.status === "failed") {
            trackEvent("checkout_payment_failed");
            if (data.redirectUrl) {
              redirectTimer = setTimeout(
                () => router.replace(data.redirectUrl!),
                250,
              );
            }
          }
          return;
        }
        if (
          !response.ok &&
          [
            "checkout_bootstrap_consumed",
            "checkout_bootstrap_expired",
            "checkout_account_conflict",
            "checkout_login_required",
          ].includes(data.error ?? "")
        ) {
          stopPolling();
          setStatus("recovery");
          setMessage(
            data.message ??
              "Die Zahlung ist bestätigt. Bitte nutze den sicheren Login oder setze dein Passwort zurück.",
          );
          return;
        }
        setMessage(data.message ?? "Deine Zahlung wird gerade bestätigt.");
        scheduleNext(check);
      } catch {
        if (!finished) scheduleNext(check);
      } finally {
        if (requestTimer) clearTimeout(requestTimer);
        if (activeController === requestController) {
          activeController = undefined;
        }
      }
    };
    const deadlineTimer = setTimeout(markDelayed, MAX_POLLING_MILLISECONDS);
    void check();
    return () => {
      stopPolling(true);
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router, sessionId]);

  return (
    <div className="text-center" aria-live="polite">
      <div
        className={`mx-auto grid size-16 place-items-center rounded-full ${status === "failed" || status === "revoked" ? "bg-danger/10 text-danger" : status === "active" ? "checkout-success-icon bg-success/10 text-success" : "bg-gold/10 text-gold"}`}
      >
        {status === "pending" ? (
          <LoaderCircle className="size-8 animate-spin" aria-hidden="true" />
        ) : status === "active" ? (
          <CheckCircle2
            className="checkout-success-check size-8"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle className="size-8" aria-hidden="true" />
        )}
      </div>
      <h1 className="mt-6 font-serif text-4xl font-semibold tracking-[-0.035em] text-navy">
        {status === "pending"
          ? "Zahlung wird bestätigt"
          : status === "active"
            ? duplicatePayment
              ? "Zahlung bestätigt – bitte prüfen"
              : "Bestellung abgeschlossen"
            : status === "revoked"
              ? "Kurszugang gesperrt"
              : status === "recovery"
                ? "Zugang sicher wiederherstellen"
                : status === "delayed"
                  ? "Bestätigung dauert länger"
                  : "Zahlung nicht bestätigt"}
      </h1>
      <p className="mx-auto mt-4 max-w-lg leading-7 text-muted">{message}</p>
      {status === "active" && !duplicatePayment && (
        <div className="mx-auto mt-6 max-w-sm" role="status">
          <p className="text-sm font-semibold text-success">
            Dein Schulungszugang ist aktiv. Du wirst automatisch zum Dashboard
            weitergeleitet.
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-success/15"
            aria-hidden="true"
          >
            <span className="checkout-success-progress block h-full rounded-full bg-success" />
          </div>
        </div>
      )}
      {status === "pending" && (
        <p className="mt-3 text-sm text-muted">
          Bitte schließe dieses Fenster noch nicht. Sobald der bestätigte
          Stripe-Webhook eingetroffen ist, gelangst du automatisch in dein
          Dashboard.
        </p>
      )}
      {status === "delayed" && (
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className={buttonStyles({ variant: "primary" })}
          >
            Dashboard prüfen
          </Link>
          <Link
            href="/kontakt"
            className={buttonStyles({ variant: "secondary" })}
          >
            Support kontaktieren
          </Link>
        </div>
      )}
      {status === "recovery" && (
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/login" className={buttonStyles({ variant: "primary" })}>
            Sicher anmelden
          </Link>
          <Link
            href="/passwort-vergessen"
            className={buttonStyles({ variant: "secondary" })}
          >
            Passwort festlegen
          </Link>
          <Link
            href="/kontakt"
            className={buttonStyles({ variant: "secondary" })}
          >
            Support kontaktieren
          </Link>
        </div>
      )}
      {status === "active" && order && (
        <div className="mt-8 text-left">
          {duplicatePayment && (
            <div
              className="mb-5 rounded-xl border border-gold/35 bg-gold/10 p-4 text-sm leading-6 text-navy"
              role="alert"
            >
              Dein Zugang bleibt aktiv. Bewahre beide Bestellnachweise auf und
              wende dich zur Klärung der möglichen Doppelbelastung an den
              Support.
            </div>
          )}
          <div
            className="rounded-2xl border border-line bg-ivory/60 p-5 sm:p-6"
            aria-label="Bestellbestätigung"
          >
            <p className="flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
              <FileCheck2 className="size-4" aria-hidden="true" />
              Bestellbestätigung
            </p>
            <dl className="mt-5 divide-y divide-line text-sm">
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="font-bold text-muted">Produkt</dt>
                <dd className="font-semibold text-navy sm:text-right">
                  {order.productName}
                </dd>
              </div>
              {order.taxAmount !== null && (
                <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                  <dt className="font-bold text-muted">Steueranteil</dt>
                  <dd className="font-semibold text-navy sm:text-right">
                    {formatPrice(order.taxAmount, order.currency)}
                  </dd>
                </div>
              )}
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="font-bold text-muted">Gesamtbetrag</dt>
                <dd className="font-serif text-xl font-semibold text-navy sm:text-right">
                  {formatPrice(order.amountTotal, order.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted">
              Der Betrag stammt aus deiner serverseitig gespeicherten
              Stripe-Bestellung. Deine Rechnung findest du nach der Verarbeitung
              unter „Bestellungen &amp; Rechnungen“ im Profil.
            </p>
          </div>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/dashboard" className={buttonStyles()}>
              Zum Dashboard
            </Link>
            <Link
              href="/profil"
              className={buttonStyles({ variant: "secondary" })}
            >
              Bestellungen &amp; Rechnungen
            </Link>
          </div>
        </div>
      )}
      {status === "failed" && (
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/checkout" className={buttonStyles()}>
            Zurück zum Checkout
          </Link>
          <Link
            href="/dashboard"
            className={buttonStyles({ variant: "secondary" })}
          >
            Dashboard öffnen
          </Link>
          <Link
            href="/kontakt"
            className={buttonStyles({ variant: "secondary" })}
          >
            Support kontaktieren
          </Link>
        </div>
      )}
      {status === "revoked" && (
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard" className={buttonStyles()}>
            Dashboard öffnen
          </Link>
          <Link
            href="/kontakt"
            className={buttonStyles({ variant: "secondary" })}
          >
            Support kontaktieren
          </Link>
        </div>
      )}
    </div>
  );
}
