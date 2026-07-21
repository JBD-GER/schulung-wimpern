import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WithdrawalForm } from "@/components/marketing/withdrawal-form";

const submissionId = "6f8c4e9a-1a85-4bd3-953f-a67240d808c1";
const receipt = {
  receiptNumber: "WR-20260721-8A2506F7B912",
  receivedAt: "2026-07-21T12:34:56.789Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: "Vor- und Nachname" }),
    "Erika Mustermann",
  );
  await user.type(
    screen.getByRole("textbox", { name: /E-Mail für die Eingangsbestätigung/ }),
    "erika@example.de",
  );
  await user.type(
    screen.getByRole("textbox", { name: /Vertragsidentifikation/ }),
    "Rechnung R-2026-123",
  );
  await user.click(screen.getByRole("button", { name: "Angaben prüfen" }));
}

describe("zweistufiges Widerrufsformular", () => {
  beforeEach(() => {
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue(submissionId);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("übermittelt erst über die eindeutige Bestätigungsfunktion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          ok: true,
          recorded: true,
          emailSent: true,
          ...receipt,
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WithdrawalForm />);

    await reachReview(user);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Erika Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Rechnung R-2026-123")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Online-Schulung Wimpernverlängerung.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Widerruf bestätigen" }),
    );

    expect(
      await screen.findByRole("status", {
        name: "",
      }),
    ).toHaveTextContent("Dein Widerruf ist eingegangen");
    expect(screen.getByRole("status")).toHaveTextContent(receipt.receiptNumber);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchMock.mock.calls[0][0]).toBe("/api/withdrawal");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(JSON.parse(String(options.body))).toEqual({
      submissionId,
      consumerName: "Erika Mustermann",
      contractReference: "Rechnung R-2026-123",
      confirmationEmail: "erika@example.de",
      confirmation: "withdrawal_confirmed",
    });
  });

  it("ermöglicht vor der verbindlichen Abgabe eine Korrektur", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<WithdrawalForm />);

    await reachReview(user);
    await user.click(screen.getByRole("button", { name: "Angaben ändern" }));

    expect(
      screen.getByRole("textbox", { name: "Vor- und Nachname" }),
    ).toHaveValue("Erika Mustermann");
    expect(
      screen.getByRole("button", { name: "Angaben prüfen" }),
    ).toBeEnabled();
  });

  it("zeigt einen gespeicherten Eingang bei Mailfehler und wiederholt nur den Versand", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: false,
            recorded: true,
            emailSent: false,
            message:
              "Dein Widerruf ist eingegangen. Die E-Mail-Bestätigung konnte gerade nicht zugestellt werden.",
            ...receipt,
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            recorded: true,
            emailSent: true,
            ...receipt,
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WithdrawalForm />);

    await reachReview(user);
    await user.click(
      screen.getByRole("button", { name: "Widerruf bestätigen" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dein Widerruf ist eingegangen",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(receipt.receiptNumber);
    await user.click(
      screen.getByRole("button", {
        name: "E-Mail-Bestätigung erneut senden",
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent(
      receipt.receiptNumber,
    );
    const firstBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    const retryBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(retryBody.submissionId).toBe(firstBody.submissionId);
  });
});
