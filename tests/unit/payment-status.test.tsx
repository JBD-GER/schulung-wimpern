import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
const googleAds = vi.hoisted(() => ({ purchase: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams("session_id=cs_test_confirmed"),
}));
vi.mock("@/lib/client/google-ads", () => ({
  trackGoogleAdsPurchase: googleAds.purchase,
}));

import { PaymentStatus } from "@/components/checkout/payment-status";

describe("Zahlungserfolg", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.replace.mockReset();
    googleAds.purchase.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("zeigt vor der Dashboard-Navigation die servergebundene Bestellbestätigung", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "active",
            redirectUrl: "/dashboard",
            order: {
              transactionId: "50000000-0000-4000-8000-000000000001",
              productName: "Online-Schulung Wimpernverlängerung",
              amountTotal: 34900,
              currency: "eur",
              taxAmount: 5571,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<PaymentStatus />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Bestellbestätigung")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Bestellung abgeschlossen" }),
    ).toBeVisible();
    expect(
      screen.getByText(/automatisch zum Dashboard weitergeleitet/i),
    ).toBeVisible();
    expect(
      screen.getByText("Online-Schulung Wimpernverlängerung"),
    ).toBeVisible();
    expect(screen.getByText(/349,00/)).toBeVisible();
    expect(googleAds.purchase).toHaveBeenCalledWith({
      transactionId: "50000000-0000-4000-8000-000000000001",
      value: 349,
      currency: "EUR",
    });
    expect(navigation.replace).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(2_699));
    expect(navigation.replace).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("zeigt eine bestätigte Doppelzahlung ohne automatische Weiterleitung", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "active",
            duplicatePayment: true,
            message:
              "Diese Zahlung ist bestätigt. Wir haben eine mögliche Doppelzahlung erkannt.",
            order: {
              transactionId: "50000000-0000-4000-8000-000000000002",
              productName: "Online-Schulung Wimpernverlängerung",
              amountTotal: 34900,
              currency: "eur",
              taxAmount: 5571,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<PaymentStatus />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });

    expect(screen.getByText(/mögliche Doppelzahlung erkannt/i)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /Zahlung bestätigt.*bitte prüfen/i }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/Doppelbelastung/i);
    expect(googleAds.purchase).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("verweigert den Erfolgszustand ohne serverseitige UUID der Bestellung", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "active",
            order: {
              transactionId: "cs_test_confirmed",
              productName: "Online-Schulung Wimpernverlängerung",
              amountTotal: 14900,
              currency: "eur",
              taxAmount: 2379,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<PaymentStatus />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("heading", { name: "Zahlung nicht bestätigt" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Bestellbestätigung"),
    ).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("beendet Polling bei administrativ gesperrtem Zugang ohne neuen Checkout-Link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "revoked",
            message:
              "Diese Zahlung ist erfasst, der Kurszugang wurde administrativ gesperrt.",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<PaymentStatus />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("heading", { name: /Kurszugang gesperrt/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Checkout/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Support/i })).toBeVisible();
  });
});
