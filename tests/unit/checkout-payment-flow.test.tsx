import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  updateBillingAddress: vi.fn(),
  validateElements: vi.fn(),
  loadStripe: vi.fn(() => Promise.resolve({})),
  providerOptions: [] as unknown[],
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/client/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: stripeMocks.loadStripe,
}));
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({
    children,
    options,
  }: PropsWithChildren<{ options: unknown }>) => {
    stripeMocks.providerOptions.push(options);
    return children;
  },
  PaymentElement: () => <div>Stripe-Zahlungsformular</div>,
  useCheckoutElements: () => ({
    type: "success" as const,
    checkout: {
      canConfirm: true,
      confirm: stripeMocks.confirm,
      updateBillingAddress: stripeMocks.updateBillingAddress,
      validateElements: stripeMocks.validateElements,
    },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: stripeMocks.push,
    replace: stripeMocks.replace,
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

const readyStripeCheckoutSession = {
  canConfirm: true,
  currency: "eur",
  total: {
    subtotal: { minorUnitsAmount: 14900 },
    taxInclusive: { minorUnitsAmount: 2379 },
    taxExclusive: { minorUnitsAmount: 0 },
    total: { minorUnitsAmount: 14900 },
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

function checkoutFlowElement() {
  return (
    <CheckoutFlow
      product={product}
      publishableKey="pk_test_checkout"
      consentVersion="checkout-2026-07-22"
    />
  );
}

function renderFlow() {
  return render(checkoutFlowElement());
}

describe("Checkout-Zahlungsfluss", () => {
  const fetchMock = vi.fn();

  function mockReadySessionBackend(recoveryStatus?: object) {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/checkout/intent/status") {
          return Response.json(
            { error: "checkout_intent_required" },
            { status: 401 },
          );
        }
        if (
          url.startsWith("/api/checkout/intent/session?session_id=") &&
          !init?.method
        ) {
          return recoveryStatus
            ? Response.json(recoveryStatus)
            : Response.json({ error: "status_unavailable" }, { status: 503 });
        }
        if (
          url === "/api/checkout/intent/client-error" &&
          init?.method === "POST"
        ) {
          return new Response(null, { status: 204 });
        }
        if (url === "/api/auth/session") {
          return Response.json({ authenticated: false });
        }
        if (url === "/api/checkout/intent" && init?.method === "POST") {
          return Response.json({ ok: true }, { status: 201 });
        }
        if (url === "/api/checkout/intent/session" && init?.method === "POST") {
          return Response.json(readySession, { status: 201 });
        }
        throw new Error(`Unexpected checkout request: ${url}`);
      },
    );
  }

  beforeEach(() => {
    window.history.replaceState(null, "", "/checkout");
    stripeMocks.confirm.mockReset();
    stripeMocks.updateBillingAddress.mockReset().mockResolvedValue({
      type: "success",
      session: readyStripeCheckoutSession,
    });
    stripeMocks.validateElements.mockReset().mockResolvedValue({
      type: "success",
      session: readyStripeCheckoutSession,
    });
    stripeMocks.loadStripe.mockClear();
    stripeMocks.providerOptions.length = 0;
    stripeMocks.push.mockReset();
    stripeMocks.replace.mockReset();
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

  it("behält die Provider-Optionen bei einem Parent-Rerender referenzstabil", async () => {
    const user = userEvent.setup();
    mockReadySessionBackend();
    const view = renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );
    await screen.findByText("Stripe-Zahlungsformular");

    const firstOptions = stripeMocks.providerOptions.at(-1);
    expect(firstOptions).toBeDefined();

    view.rerender(checkoutFlowElement());

    expect(stripeMocks.providerOptions.at(-1)).toBe(firstOptions);
  });

  it("synchronisiert die Rechnungsadresse und validiert vor der Zahlungsbestätigung", async () => {
    const user = userEvent.setup();
    mockReadySessionBackend();
    stripeMocks.confirm.mockResolvedValue({ type: "success", session: {} });
    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );
    await screen.findByText("Stripe-Zahlungsformular");

    await user.click(
      screen.getByRole("button", { name: "Zahlungspflichtig bestellen" }),
    );

    await waitFor(() => expect(stripeMocks.confirm).toHaveBeenCalledOnce());
    expect(stripeMocks.updateBillingAddress).toHaveBeenCalledWith({
      name: "Erika Mustermann",
      address: {
        line1: "Musterweg 12",
        postal_code: "31633",
        city: "Leese",
        country: "DE",
      },
    });
    expect(stripeMocks.validateElements).toHaveBeenCalledOnce();
    expect(
      stripeMocks.updateBillingAddress.mock.invocationCallOrder[0],
    ).toBeLessThan(stripeMocks.validateElements.mock.invocationCallOrder[0]);
    expect(
      stripeMocks.validateElements.mock.invocationCallOrder[0],
    ).toBeLessThan(stripeMocks.confirm.mock.invocationCallOrder[0]);
    expect(stripeMocks.confirm.mock.calls[0]?.[0]).not.toHaveProperty(
      "billingAddress",
    );
    expect(stripeMocks.confirm.mock.calls[0]?.[0]).not.toHaveProperty(
      "returnUrl",
    );
  });

  it("bestätigt bei einer abgelehnten Rechnungsadresse keine Zahlung", async () => {
    const user = userEvent.setup();
    mockReadySessionBackend();
    stripeMocks.updateBillingAddress.mockResolvedValue({
      type: "error",
      error: {
        message: "Rechnungsadresse konnte nicht synchronisiert werden.",
        code: null,
      },
    });
    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );
    await screen.findByText("Stripe-Zahlungsformular");

    await user.click(
      screen.getByRole("button", { name: "Zahlungspflichtig bestellen" }),
    );

    await waitFor(() =>
      expect(stripeMocks.updateBillingAddress).toHaveBeenCalledOnce(),
    );
    expect(
      await screen.findByText(
        "Rechnungsadresse konnte nicht synchronisiert werden.",
      ),
    ).toBeVisible();
    expect(stripeMocks.validateElements).not.toHaveBeenCalled();
    expect(stripeMocks.confirm).not.toHaveBeenCalled();
  });

  it("bestätigt nicht, solange Stripe die Session nicht freigegeben hat", async () => {
    const user = userEvent.setup();
    mockReadySessionBackend();
    stripeMocks.validateElements.mockResolvedValue({
      type: "success",
      session: { ...readyStripeCheckoutSession, canConfirm: false },
    });
    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );
    await screen.findByText("Stripe-Zahlungsformular");

    const confirmButton = screen.getByRole("button", {
      name: "Zahlungspflichtig bestellen",
    });
    await user.click(confirmButton);

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(stripeMocks.updateBillingAddress).toHaveBeenCalledOnce();
    expect(stripeMocks.validateElements).toHaveBeenCalledOnce();
    expect(stripeMocks.confirm).not.toHaveBeenCalled();
    expect(confirmButton).toBeEnabled();
  });

  it("bestätigt bei ungültigen Stripe-Elementen keine Zahlung", async () => {
    const user = userEvent.setup();
    mockReadySessionBackend();
    stripeMocks.validateElements.mockResolvedValue({
      type: "error",
      error: {
        message: "Bitte vervollständige deine Kartendaten.",
        code: "validation_error",
        validation_errors: [],
      },
    });
    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );
    await screen.findByText("Stripe-Zahlungsformular");

    await user.click(
      screen.getByRole("button", { name: "Zahlungspflichtig bestellen" }),
    );

    expect(
      await screen.findByText("Bitte vervollständige deine Kartendaten."),
    ).toBeVisible();
    expect(stripeMocks.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["bezahlten", { paymentStatus: "paid", sessionStatus: "open" }],
    ["abgeschlossenen", { paymentStatus: "unpaid", sessionStatus: "complete" }],
  ])(
    "stellt einen %s Checkout nach einer Confirm-Ausnahme serverseitig wieder her",
    async (_label, remoteSession) => {
      const user = userEvent.setup();
      const redirectUrl = "/zahlung-erfolgreich?session_id=cs_test_checkout";
      mockReadySessionBackend({
        ready: true,
        status: "open",
        phase: "payment",
        redirectUrl,
        ...remoteSession,
      });
      stripeMocks.confirm.mockRejectedValue(new Error("network interrupted"));
      renderFlow();
      await reachPaymentStep(user);
      for (const checkbox of screen.getAllByRole("checkbox")) {
        await user.click(checkbox);
      }
      await user.click(
        screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
      );
      await screen.findByText("Stripe-Zahlungsformular");

      await user.click(
        screen.getByRole("button", { name: "Zahlungspflichtig bestellen" }),
      );

      await waitFor(() => {
        const navigations = [
          ...stripeMocks.push.mock.calls,
          ...stripeMocks.replace.mock.calls,
        ];
        expect(navigations).toContainEqual([redirectUrl]);
      });
      expect(stripeMocks.confirm).toHaveBeenCalledOnce();
    },
  );

  it("meldet nach offener unbezahlter Session präzise den sicheren Wiederholungszustand", async () => {
    const user = userEvent.setup();
    mockReadySessionBackend({
      ready: true,
      status: "open",
      phase: "payment",
      paymentStatus: "unpaid",
      sessionStatus: "open",
      redirectUrl: null,
    });
    stripeMocks.confirm
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce({ type: "success", session: {} });
    renderFlow();
    await reachPaymentStep(user);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    await user.click(
      screen.getByRole("button", { name: /Sichere Zahlung öffnen/ }),
    );
    await screen.findByText("Stripe-Zahlungsformular");

    const confirmButton = screen.getByRole("button", {
      name: "Zahlungspflichtig bestellen",
    });
    await user.click(confirmButton);

    expect(await screen.findByText(/keine Belastung bestätigt/i)).toBeVisible();
    expect(confirmButton).toBeEnabled();
    expect(stripeMocks.push).not.toHaveBeenCalled();
    expect(stripeMocks.replace).not.toHaveBeenCalled();

    await user.click(confirmButton);
    await waitFor(() => expect(stripeMocks.confirm).toHaveBeenCalledTimes(2));
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
        if (
          url === "/api/checkout/intent/client-error" &&
          init?.method === "POST"
        ) {
          return new Response(null, { status: 204 });
        }
        if (
          url.startsWith("/api/checkout/intent/session?session_id=") &&
          !init?.method
        ) {
          return Response.json({
            sessionStatus: "open",
            paymentStatus: "unpaid",
          });
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
    await waitFor(() => expect(stripeMocks.confirm).toHaveBeenCalledTimes(1));
    expect(stripeMocks.validateElements).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Zurück zu Rechnungsdaten" }),
    ).toBeDisabled();

    await act(async () => {
      confirmRequest.reject(new Error("Stripe network failure"));
      await confirmRequest.promise.catch(() => undefined);
    });
    expect(await screen.findByText(/keine Belastung bestätigt/i)).toBeVisible();
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
