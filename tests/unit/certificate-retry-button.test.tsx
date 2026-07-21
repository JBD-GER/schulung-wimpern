import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CertificateRetryButton } from "@/components/certificate/certificate-retry-button";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Zertifikats-Retry-Button", () => {
  beforeEach(() => {
    router.refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sendet genau einen Retry, sperrt sich währenddessen und aktualisiert bei Erfolg", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CertificateRetryButton />);
    const button = screen.getByRole("button", {
      name: "Erstellung erneut versuchen",
    });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Wird erneut geprüft");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/certificate",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: expect.any(AbortSignal),
      }),
    );

    resolveRequest?.(
      jsonResponse({ state: "valid", certificateId: "certificate-1" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Dein Zertifikat ist bereit.",
      );
    });
    expect(button).toBeEnabled();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("behandelt 202 als laufende Erstellung und aktualisiert den Server-Stand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ state: "generating" }, 202)),
    );
    const user = userEvent.setup();

    render(<CertificateRetryButton />);
    await user.click(
      screen.getByRole("button", { name: "Erstellung erneut versuchen" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Die sichere Erstellung wurde erneut angestoßen.",
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("zeigt den sicheren Serverfehler als Alert und erlaubt einen weiteren Versuch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "certificate_not_eligible",
            message:
              "Der aktuelle, vollständig belegte Kursabschluss konnte nicht bestätigt werden.",
          },
          409,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ state: "valid" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CertificateRetryButton />);
    const button = screen.getByRole("button", {
      name: "Erstellung erneut versuchen",
    });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der aktuelle, vollständig belegte Kursabschluss konnte nicht bestätigt werden.",
    );
    expect(button).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();

    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Dein Zertifikat ist bereit.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("beendet auch eine hängende Anfrage und gibt den Retry wieder frei", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CertificateRetryButton />);
    const button = screen.getByRole("button", {
      name: "Erstellung erneut versuchen",
    });
    fireEvent.click(button);
    expect(button).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.",
    );
    expect(button).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
