import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));
vi.mock("@/lib/client/analytics", () => ({ trackEvent: vi.fn() }));

import {
  ConsentManager,
  protectAnalyticsEvent,
} from "@/components/privacy/consent-manager";

describe("ConsentManager", () => {
  beforeEach(() => {
    cleanup();
    document.cookie = "swv_consent=; Max-Age=0; Path=/";
    vi.restoreAllMocks();
  });

  it("lädt Statistik vor einer Einwilligung nicht und bietet gleichwertige Ablehnung", async () => {
    render(
      <ConsentManager version="cookies-2026-07-21">
        <main>Website</main>
      </ConsentManager>,
    );

    expect(
      await screen.findByRole("heading", { name: "Deine Privatsphäre" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nur notwendige" }),
    ).toBeInTheDocument();
  });

  it("lädt Vercel Analytics erst nach protokollierter Zustimmung", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          consent: {
            version: "cookies-2026-07-21",
            necessary: true,
            analytics: true,
            marketing: false,
            updatedAt: "2026-07-21T18:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ConsentManager version="cookies-2026-07-21">
        <main>Website</main>
      </ConsentManager>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Alle akzeptieren" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("vercel-analytics")).toBeInTheDocument(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/privacy/consent",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("blockiert private Seitenaufrufe und anonymisiert erlaubte Funnel-Ereignisse", () => {
    expect(
      protectAnalyticsEvent({
        type: "pageview",
        url: "https://example.test/dashboard?user=secret",
      }),
    ).toBeNull();
    expect(
      protectAnalyticsEvent({
        type: "event",
        url: "https://example.test/admin?user=secret",
      }),
    ).toBeNull();
    expect(
      protectAnalyticsEvent({
        type: "event",
        url: "https://example.test/checkout?session_id=secret#payment",
      }),
    ).toEqual({
      type: "event",
      url: "https://example.test/checkout",
    });
  });
});
