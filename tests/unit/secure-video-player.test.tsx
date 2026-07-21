import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    expect(
      screen.getByText("90 % erreicht – Wissenstest freigeschaltet"),
    ).toBeVisible();
  });

  it("sendet einen Seek, der während einer laufenden Speicherung passiert, direkt danach nach", async () => {
    let resolveFirstProgress!: (response: Response) => void;
    const firstProgress = new Promise<Response>((resolve) => {
      resolveFirstProgress = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(playbackPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockReturnValueOnce(firstProgress)
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

    player.currentTime = 100;
    act(() => listeners.get("seeked")?.());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    player.currentTime = 900;
    act(() => listeners.get("seeked")?.());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveFirstProgress(
      new Response(JSON.stringify({ watchedPercent: 10 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const queuedRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(queuedRequest.body))).toMatchObject({
      currentTime: 900,
      duration: 1_000,
    });
    await waitFor(() =>
      expect(screen.getByText("90 % angesehen")).toBeVisible(),
    );
  });

  it("zeigt bei bereits bestätigter Freischaltung die Quiz-Aktion und löst nur die Navigation aus", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(playbackPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const navigate = vi.fn();
    window.addEventListener(
      "quiz-navigate:30000000-0000-4000-8000-000000000001",
      navigate,
    );

    render(
      <SecureVideoPlayer
        lessonId="30000000-0000-4000-8000-000000000001"
        lessonTitle="Testlektion"
        initialWatchedPercent={90}
        initialQuizAvailable
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Wissenstest starten" }),
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      "quiz-navigate:30000000-0000-4000-8000-000000000001",
      navigate,
    );
  });

  it("behält einen fehlgeschlagenen Stand vorgemerkt und speichert ihn über die Retry-Aktion", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(playbackPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "temporary_error",
            message: "Der Fortschritt konnte gerade nicht gespeichert werden.",
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        ),
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
    act(() => listeners.get("seeked")?.());

    const retry = await screen.findByRole("button", {
      name: "Erneut speichern",
    });
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText("90 % erreicht – Wissenstest freigeschaltet"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Erneut speichern" }),
    ).not.toBeInTheDocument();
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

  it("schreibt beim Wiederholen eines abgeschlossenen Kurses keinen neuen Fortschritt", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...playbackPayload, replayMode: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <SecureVideoPlayer
        lessonId="30000000-0000-4000-8000-000000000001"
        lessonTitle="Testlektion"
        initialWatchedPercent={100}
        quizCompleted
      />,
    );

    await waitFor(() => expect(listeners.has("seeked")).toBe(true));
    player.currentTime = 500;
    act(() => listeners.get("seeked")?.());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Kurs abgeschlossen · Wiederholung")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Wissenstest starten" }),
    ).not.toBeInTheDocument();
  });
});
