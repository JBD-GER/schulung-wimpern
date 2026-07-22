import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  loadStripe: vi.fn(() => Promise.resolve({})),
  push: vi.fn(),
}));

vi.mock("@/lib/client/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: stripeMocks.loadStripe,
}));
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children }: PropsWithChildren) => children,
  PaymentElement: () => <div>Stripe-Zahlungsformular</div>,
  useCheckoutElements: () => ({
    type: "success" as const,
    checkout: { confirm: stripeMocks.confirm },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: stripeMocks.push,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { CheckoutFlow } from "@/components/checkout/checkout-flow";

const product = {
  name: "Online-Schulung Wimpernverlängerung",
  unitAmount: 14900,
  currency: "EUR",
  taxBehavior: "inclusive",
  available: true,
};

const readySession = {
  clientSecret: "checkout_client_secret",
  sessionId: "cs_test_checkout",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  product,
  totals: {
    status: "ready",
    subtotal: 14900,
    tax: 2379,
    total: 14900,
    currency: "EUR",
    taxBehavior: "inclusive",
    automaticTaxEnabled: true,
    automaticTaxStatus: "complete",
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function reachBillingStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^Vorname/), "Erika");
  await user.type(screen.getByLabelText(/^Nachname/), "Mustermann");
  await user.type(screen.getByLabelText(/^E-Mail-Adresse/), "erika@example.de");
  await user.type(
    screen.getByLabelText(/^Passwort festlegen/),
    "SicheresPasswort9!",
  );
  await user.type(
    screen.getByLabelText(/^Passwort wiederholen/),
    "SicheresPasswort9!",
  );
  await user.click(
    screen.getByRole("button", { name: /Weiter zu den Rechnungsdaten/ }),
  );
  await screen.findByRole("heading", { name: "Rechnungsdaten" });
}

async function reachPaymentStep(user: ReturnType<typeof userEvent.setup>) {
  await reachBillingStep(user);
  await user.type(
    screen.getByLabelText(/^Straße und Hausnummer/),
    "Musterweg 12",
  );
  await user.type(screen.getByLabelText(/^Postleitzahl/), "31633");
  await user.type(screen.getByLabelText(/^Ort/), "Leese");
  await user.click(
    screen.getByRole("button", { name: /Zur sicheren Zahlung/ }),
  );
  await screen.findByRole("heading", { name: "Sicher bezahlen" });
}

function renderFlow() {
  render(
    <CheckoutFlow
      product={product}
      publishableKey="pk_test_checkout"
      consentVersion="checkout-2026-07-22"
    />,
  );
}

describe("Checkout-Zahlungsfluss", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, "", "/checkout");
    stripeMocks.confirm.mockReset();
    stripeMocks.loadStripe.mockClear();
    stripeMocks.push.mockReset();
    fetchMock
      .mockReset()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url === "/api/checkout/intent/status") {
            return Response.json(
              { error: "checkout_intent_required" },
              { status: 401 },
            );
          }
          if (url === "/api/auth/session") {
            return Response.json({
              authenticated: false,
              emailVerified: false,
            });
          }
          if (url === "/api/checkout/intent" && init?.method === "POST") {
            return Response.json(
              { ok: true, ready: true, accountMode: "new" },
              { status: 201 },
            );
          }
          throw new Error(`Unexpected checkout request: ${url}`);
        },
      );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("behält Rechnungsdaten beim Zurückgehen aus dem Zahlungsschritt", async () => {
    const user = userEvent.setup();
    renderFlow();
    await reachPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    await screen.findByRole("heading", { name: "Rechnungsdaten" });
    expect(screen.getByLabelText(/^Straße und Hausnummer/)).toHaveValue(
      "Musterweg 12",
    );
    expect(screen.getByLabelText(/^Postleitzahl/)).toHaveValue("31633");
    expect(screen.getByLabelText(/^Ort/)).toHaveValue("Leese");
  });

  it("serialisiert Vorbereitung, Bestätigung und Abbruch und setzt danach lokal zurück", async () => {
    const user = userEvent.setup();
    const sessionRequest = deferred<Response>();
    const confirmRequest = deferred<never>();
    const cancelRequest = deferred<Response>();

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/checkout/intent/status") {
          return Response.json(
            { error: "checkout_intent_required" },
            { status: 401 },
          );
        }
        if (url === "/api/auth/session") {
          return Response.json({ authenticated: false });
        }
        if (url === "/api/checkout/intent" && init?.method === "POST") {
          return Response.json({ ok: true }, { status: 201 });
        }
        if (url === "/api/checkout/intent/session" && init?.method === "POST") {
          return sessionRequest.promise;
        }
        if (url === "/api/checkout/intent/cancel" && init?.method === "POST") {
          return cancelRequest.promise;
        }
        throw new Error(`Unexpected checkout request: ${url}`);
      },
    );
    stripeMocks.confirm.mockReturnValue(confirmRequest.promise);

    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }

    const prepareButton = screen.getByRole("button", {
      name: /Sichere Zahlung öffnen/,
    });
    act(() => {
      prepareButton.click();
      prepareButton.click();
    });

    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/checkout/intent/session" && init?.method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Zurück zu Rechnungsdaten" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zurück" })).toBeDisabled();

    await act(async () => {
      sessionRequest.resolve(Response.json(readySession, { status: 201 }));
      await sessionRequest.promise;
    });
    await screen.findByText("Stripe-Zahlungsformular");

    const confirmButton = screen.getByRole("button", {
      name: "Zahlungspflichtig bestellen",
    });
    act(() => {
      confirmButton.click();
      confirmButton.click();
    });
    expect(stripeMocks.confirm).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Zurück zu Rechnungsdaten" }),
    ).toBeDisabled();

    await act(async () => {
      confirmRequest.reject(new Error("Stripe network failure"));
      await confirmRequest.promise.catch(() => undefined);
    });
    expect(
      await screen.findByText(/Netzwerkstörung nicht abgeschlossen/),
    ).toBeVisible();
    expect(confirmButton).toBeEnabled();

    const cancelButton = screen.getByRole("button", {
      name: "Checkout abbrechen",
    });
    act(() => {
      cancelButton.click();
      cancelButton.click();
    });
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/checkout/intent/cancel" && init?.method === "POST",
      ),
    ).toHaveLength(1);

    await act(async () => {
      cancelRequest.resolve(
        Response.json({
          ok: true,
          redirectUrl: "/checkout?payment=cancelled",
        }),
      );
      await cancelRequest.promise;
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/^Vorname/)).toBeVisible(),
    );
    expect(window.location.pathname).toBe("/checkout");
    expect(window.location.search).toBe("?payment=cancelled");
  });

  it("führt bei einer verwaisten offenen Session kontrolliert zur Identitätsprüfung zurück", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/checkout/intent/status") {
          return Response.json(
            { error: "checkout_intent_required" },
            { status: 401 },
          );
        }
        if (url === "/api/auth/session") {
          return Response.json({ authenticated: false });
        }
        if (url === "/api/checkout/intent" && init?.method === "POST") {
          return Response.json({ ok: true }, { status: 201 });
        }
        if (url === "/api/checkout/intent/session" && init?.method === "POST") {
          return Response.json(
            {
              error: "checkout_session_already_open",
              message:
                "Ein früherer Zahlungsbereich muss wiederhergestellt werden.",
            },
            { status: 409 },
          );
        }
        if (url === "/api/checkout/intent/cancel" && init?.method === "POST") {
          return Response.json({ ok: true });
        }
        throw new Error(`Unexpected checkout request: ${url}`);
      },
    );

    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );

    const recover = await screen.findByRole("button", {
      name: "Früheren Checkout wiederherstellen",
    });
    await user.click(recover);

    expect(await screen.findByLabelText(/^Vorname/)).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/checkout/intent/cancel" && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });
});
