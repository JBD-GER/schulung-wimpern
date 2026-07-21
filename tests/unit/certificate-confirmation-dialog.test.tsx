import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CertificateConfirmationDialog } from "@/components/certificate/certificate-confirmation-dialog";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Dialog zur einmaligen Zertifikatsausstellung", () => {
  beforeEach(() => {
    router.refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("zeigt den exakten Namen und verlangt beide ausdrücklichen Bestätigungen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ state: "generating" }, 202));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CertificateConfirmationDialog suggestedName="Erika Mustermann" />);

    expect(
      screen.getByRole("dialog", {
        name: "Namen vor der Ausstellung bestätigen",
      }),
    ).toBeInTheDocument();
    const name = screen.getByLabelText("Vor- und Nachname auf dem Zertifikat");
    expect(name).toHaveValue("Erika Mustermann");
    expect(screen.getByText(/Gedruckter Name:/)).toHaveTextContent(
      "Erika Mustermann",
    );

    const submit = screen.getByRole("button", {
      name: "Verbindlich bestätigen und ausstellen",
    });
    expect(submit).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /das Zertifikat nur einmal automatisch ausgestellt wird/,
      }),
    );
    expect(submit).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /dieser Prozess kostenpflichtig sein kann/,
      }),
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/certificate/confirm",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          participantName: "Erika Mustermann",
          singleIssuanceConfirmed: true,
          correctionFeeNoticeConfirmed: true,
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("lässt die Korrektur des Namens vor der Bestätigung zu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ state: "valid" })),
    );
    const user = userEvent.setup();

    render(<CertificateConfirmationDialog suggestedName="Erika Muster" />);
    const name = screen.getByLabelText("Vor- und Nachname auf dem Zertifikat");
    await user.clear(name);
    await user.type(name, "Erika Marie Mustermann");

    expect(screen.getByText(/Gedruckter Name:/)).toHaveTextContent(
      "Erika Marie Mustermann",
    );
  });

  it("zeigt Serverfehler und lässt keine falsche Erfolgsmeldung erscheinen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: "certificate_confirmation_immutable",
            message: "Der Zertifikatsname wurde bereits verbindlich bestätigt.",
          },
          409,
        ),
      ),
    );
    const user = userEvent.setup();
    render(<CertificateConfirmationDialog suggestedName="Erika Mustermann" />);
    await user.click(
      screen.getByRole("checkbox", {
        name: /das Zertifikat nur einmal automatisch ausgestellt wird/,
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /dieser Prozess kostenpflichtig sein kann/,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Verbindlich bestätigen und ausstellen",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Zertifikatsname wurde bereits verbindlich bestätigt.",
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
