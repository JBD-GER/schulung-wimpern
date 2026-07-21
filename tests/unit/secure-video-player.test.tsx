import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecureVideoPlayer } from "@/components/course/secure-video-player";

type PlayerListener = () => void;

const listeners = new Map<string, PlayerListener>();
const player = {
  currentTime: 0,
  duration: 1_000,
  addEventListener: vi.fn((name: string, listener: PlayerListener) => {
    listeners.set(name, listener);
  }),
  removeEventListener: vi.fn((name: string) => {
    listeners.delete(name);
  }),
};

const playbackPayload = {
  playbackUrl: "https://customer.cloudflarestream.com/signed-token/iframe",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  listeners.clear();
  player.currentTime = 0;
  player.duration = 1_000;
  player.addEventListener.mockClear();
  player.removeEventListener.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  window.Stream = vi.fn(() => player);
});

afterEach(() => {
  cleanup();
  delete window.Stream;
  vi.unstubAllGlobals();
});

describe("SecureVideoPlayer", () => {
  it("erfasst einen Seek sofort als höchsten erreichten Abspielpunkt", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(playbackPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ watchedPercent: 90, quizAvailable: true }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    render(
      <SecureVideoPlayer
        lessonId="30000000-0000-4000-8000-000000000001"
        lessonTitle="Testlektion"
        initialWatchedPercent={0}
      />,
    );

    await waitFor(() => expect(listeners.has("seeked")).toBe(true));

    player.currentTime = 900;
    await act(async () => {
      listeners.get("seeked")?.();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const progressRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(progressRequest.body))).toEqual({
      lessonId: "30000000-0000-4000-8000-000000000001",
      currentTime: 900,
      duration: 1_000,
    });
    expect(screen.getByText("90 % angesehen")).toBeVisible();
  });

  it("sendet in der Admin-Vorschau auch bei einem Seek keinen Fortschritt", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...playbackPayload, previewMode: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <SecureVideoPlayer
        lessonId="30000000-0000-4000-8000-000000000001"
        lessonTitle="Testlektion"
        initialWatchedPercent={0}
        previewMode
      />,
    );

    await waitFor(() => expect(listeners.has("seeked")).toBe(true));
    player.currentTime = 900;
    await act(async () => {
      listeners.get("seeked")?.();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Admin-Vorschau · Fortschritt aus")).toBeVisible();
  });
});
