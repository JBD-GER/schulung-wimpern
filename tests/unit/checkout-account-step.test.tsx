import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/analytics", () => ({ trackEvent: vi.fn() }));

import { CheckoutFlow } from "@/components/checkout/checkout-flow";

const fetchMock = vi.fn();

describe("Teilnehmerkonto im Checkout", () => {
  beforeEach(() => {
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

  it("fragt das Passwort zweimal ab und wechselt ohne E-Mail-Link zu den Rechnungsdaten", async () => {
    const user = userEvent.setup();
    render(
      <CheckoutFlow
        product={{
          name: "Online-Schulung Wimpernverlängerung",
          unitAmount: 14900,
          currency: "EUR",
          taxBehavior: "inclusive",
          available: true,
        }}
        publishableKey="pk_test_checkout"
        consentVersion="checkout-2026-07-22"
      />,
    );

    await screen.findByLabelText(/^Vorname/);
    await user.type(screen.getByLabelText(/^Vorname/), "Erika");
    await user.type(screen.getByLabelText(/^Nachname/), "Mustermann");
    await user.type(
      screen.getByLabelText(/^E-Mail-Adresse/),
      "erika@example.de",
    );
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
    expect(
      screen.queryByRole("heading", {
        name: "Bestätige deine E-Mail-Adresse",
      }),
    ).not.toBeInTheDocument();
    const intentCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/checkout/intent" && init?.method === "POST",
    );
    expect(intentCall).toBeDefined();
    const body = JSON.parse(String(intentCall?.[1]?.body));
    expect(body).toMatchObject({
      email: "erika@example.de",
      password: "SicheresPasswort9!",
    });
    expect(body).not.toHaveProperty("passwordConfirmation");
    await waitFor(() =>
      expect(screen.getByLabelText(/^Straße und Hausnummer/)).toBeVisible(),
    );
  });
});
