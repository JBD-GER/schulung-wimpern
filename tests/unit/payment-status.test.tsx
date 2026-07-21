import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams("session_id=cs_test_confirmed"),
}));

import { PaymentStatus } from "@/components/checkout/payment-status";

describe("Zahlungserfolg", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.replace.mockReset();
  });

  afterEach(() => {
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
      screen.getByText("Online-Schulung Wimpernverlängerung"),
    ).toBeVisible();
    expect(screen.getByText(/349,00/)).toBeVisible();
    expect(navigation.replace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
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
    expect(screen.getByRole("alert")).toHaveTextContent(/Doppelbelastung/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
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
