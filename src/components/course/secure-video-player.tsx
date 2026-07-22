"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/dashboard/ui";

type StreamPlayer = {
  currentTime: number;
  duration: number;
  addEventListener: (name: string, callback: () => void) => void;
  removeEventListener: (name: string, callback: () => void) => void;
};

declare global {
  interface Window {
    Stream?: (element: HTMLIFrameElement) => StreamPlayer;
  }
}

type TokenPayload = {
  playbackUrl: string;
  expiresAt?: string;
  previewMode?: boolean;
  replayMode?: boolean;
};

type ProgressPayload = {
  watchedPercent?: number;
  quizAvailable?: boolean;
};

let streamSdkPromise: Promise<void> | null = null;

function loadStreamSdk() {
  if (typeof window === "undefined" || window.Stream) return Promise.resolve();
  if (streamSdkPromise) return streamSdkPromise;

  streamSdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-stream-player-sdk]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("SDK konnte nicht geladen werden.")),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
    script.async = true;
    script.dataset.streamPlayerSdk = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("SDK konnte nicht geladen werden.")),
      {
        once: true,
      },
    );
    document.head.appendChild(script);
  });

  return streamSdkPromise;
}

function validPlaybackUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseTokenPayload(value: unknown): TokenPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const playbackUrl = validPlaybackUrl(record.playbackUrl);
  if (!playbackUrl) return null;
  return {
    playbackUrl,
    expiresAt:
      typeof record.expiresAt === "string" ? record.expiresAt : undefined,
    previewMode: record.previewMode === true,
    replayMode: record.replayMode === true,
  };
}

export function SecureVideoPlayer({
  lessonId,
  lessonTitle,
  initialWatchedPercent,
  initialQuizAvailable = false,
  quizCompleted = false,
  previewMode = false,
  onQuizUnlocked,
}: {
  lessonId: string;
  lessonTitle: string;
  initialWatchedPercent: number;
  initialQuizAvailable?: boolean;
  quizCompleted?: boolean;
  previewMode?: boolean;
  onQuizUnlocked?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentTimeRef = useRef(0);
  const furthestPositionRef = useRef(0);
  const durationRef = useRef(0);
  const progressDirtyRef = useRef(false);
  const lastFlushRef = useRef(0);
  const inFlightRef = useRef(false);
  const flushQueuedRef = useRef(false);
  const queuedKeepaliveRef = useRef(false);
  const flushProgressRef = useRef<(keepalive?: boolean) => Promise<void>>(
    async () => undefined,
  );
  const quizConfirmedRef = useRef(initialQuizAvailable || quizCompleted);
  const [token, setToken] = useState<TokenPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [progressSaveFailed, setProgressSaveFailed] = useState(false);
  const [watchedPercent, setWatchedPercent] = useState(initialWatchedPercent);
  const [quizAvailable, setQuizAvailable] = useState(
    initialQuizAvailable && !quizCompleted,
  );
  const [requestKey, setRequestKey] = useState(0);
  const readOnlyPreview = previewMode || token?.previewMode === true;
  const completedReplay = token?.replayMode === true;
  const progressReadOnly = readOnlyPreview || completedReplay;

  const flushProgress = useCallback(
    async (keepalive = false) => {
      if (
        progressReadOnly ||
        !progressDirtyRef.current ||
        durationRef.current <= 0
      )
        return;
      if (inFlightRef.current) {
        flushQueuedRef.current = true;
        queuedKeepaliveRef.current = queuedKeepaliveRef.current || keepalive;
        return;
      }
      inFlightRef.current = true;
      const submittedPosition = furthestPositionRef.current;
      progressDirtyRef.current = false;
      const body = JSON.stringify({
        lessonId,
        currentTime: Math.round(submittedPosition * 10) / 10,
        duration: Math.round(durationRef.current * 10) / 10,
      });

      lastFlushRef.current = Date.now();
      try {
        const response = await fetch("/api/progress", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive,
        });
        if (!response.ok) {
          let failureMessage = "Fortschritt konnte nicht gespeichert werden.";
          try {
            const failure = (await response.json()) as { message?: unknown };
            if (typeof failure.message === "string" && failure.message.trim()) {
              failureMessage = failure.message;
            }
          } catch {
            // A non-JSON upstream error still gets the safe fallback above.
          }
          throw new Error(failureMessage);
        }
        if (!keepalive) {
          const result = (await response.json()) as ProgressPayload;
          if (
            typeof result.watchedPercent === "number" &&
            Number.isFinite(result.watchedPercent)
          ) {
            const confirmedPercent = Math.max(
              0,
              Math.min(100, Math.floor(result.watchedPercent)),
            );
            setWatchedPercent((current) => Math.max(current, confirmedPercent));
          }
          if (
            result.quizAvailable === true &&
            !quizCompleted &&
            !quizConfirmedRef.current
          ) {
            quizConfirmedRef.current = true;
            setQuizAvailable(true);
            onQuizUnlocked?.();
            window.dispatchEvent(new Event(`quiz-unlocked:${lessonId}`));
          }
          setProgressSaveFailed(false);
          setMessage(null);
        }
      } catch (error) {
        progressDirtyRef.current = true;
        if (!keepalive) {
          setProgressSaveFailed(true);
          setMessage(
            error instanceof Error
              ? `${error.message} Der erreichte Stand bleibt vorgemerkt und wird beim nächsten Wiedergabeereignis erneut gesendet.`
              : "Dein Fortschritt konnte noch nicht gespeichert werden. Der erreichte Stand bleibt vorgemerkt und wird erneut gesendet.",
          );
        }
      } finally {
        inFlightRef.current = false;
        const flushQueued = flushQueuedRef.current;
        const queuedKeepalive = queuedKeepaliveRef.current;
        flushQueuedRef.current = false;
        queuedKeepaliveRef.current = false;
        if (flushQueued && progressDirtyRef.current) {
          void flushProgressRef.current(queuedKeepalive);
        }
      }
    },
    [lessonId, onQuizUnlocked, progressReadOnly, quizCompleted],
  );

  useEffect(() => {
    flushProgressRef.current = flushProgress;
  }, [flushProgress]);

  const recordTime = useCallback(
    (currentTime: number, duration: number) => {
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      currentTimeRef.current = currentTime;
      if (Number.isFinite(duration) && duration > 0) {
        durationRef.current = duration;
        if (furthestPositionRef.current === 0 && initialWatchedPercent > 0) {
          furthestPositionRef.current = Math.min(
            duration,
            (duration * initialWatchedPercent) / 100,
          );
        }
      }
      if (progressReadOnly || durationRef.current <= 0) return;

      const boundedPosition = Math.min(durationRef.current, currentTime);
      if (boundedPosition > furthestPositionRef.current) {
        furthestPositionRef.current = boundedPosition;
        progressDirtyRef.current = true;
        setWatchedPercent(
          Math.min(
            100,
            Math.floor((boundedPosition / durationRef.current) * 100),
          ),
        );
      }

      if (Date.now() - lastFlushRef.current >= 15_000) {
        void flushProgress();
      }
    },
    [flushProgress, initialWatchedPercent, progressReadOnly],
  );

  useEffect(() => {
    const controller = new AbortController();
    lastFlushRef.current = Date.now();

    void fetch("/api/video-token", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Videozugriff wurde nicht freigegeben.");
        const payload = parseTokenPayload(await response.json());
        if (!payload)
          throw new Error("Die Videokonfiguration ist unvollständig.");
        setToken(payload);
        setMessage(null);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Das Video konnte nicht geladen werden.",
        );
      });

    return () => controller.abort();
  }, [lessonId, requestKey]);

  useEffect(() => {
    if (!token || !iframeRef.current) return;
    let cancelled = false;
    let player: StreamPlayer | null = null;
    const listeners: Array<[string, () => void]> = [];

    void loadStreamSdk()
      .then(() => {
        if (cancelled || !window.Stream || !iframeRef.current) return;
        player = window.Stream(iframeRef.current);
        if (currentTimeRef.current > 0) {
          try {
            player.currentTime = currentTimeRef.current;
          } catch {
            // A refreshed player may reject seeking until its metadata is ready.
            // The furthest stored playhead remains intact on the server.
          }
        }
        const onTimeUpdate = () => {
          if (!player) return;
          recordTime(player.currentTime, player.duration);
        };
        const onPlay = () => {
          if (!player) return;
          recordTime(player.currentTime, player.duration);
        };
        const onSeeked = () => {
          if (!player) return;
          recordTime(player.currentTime, player.duration);
          void flushProgress();
        };
        const onPause = () => {
          if (player) recordTime(player.currentTime, player.duration);
          void flushProgress();
        };
        const onEnded = () => {
          if (player) recordTime(player.duration, player.duration);
          void flushProgress();
        };

        listeners.push(
          ["timeupdate", onTimeUpdate],
          ["play", onPlay],
          ["seeked", onSeeked],
          ["pause", onPause],
          ["ended", onEnded],
        );
        for (const [eventName, listener] of listeners)
          player.addEventListener(eventName, listener);
      })
      .catch(() =>
        setMessage(
          "Der Videoplayer ist geladen, aber die automatische Fortschrittserfassung ist noch nicht verfügbar.",
        ),
      );

    return () => {
      cancelled = true;
      if (player) {
        for (const [eventName, listener] of listeners)
          player.removeEventListener(eventName, listener);
      }
    };
  }, [flushProgress, recordTime, token]);

  useEffect(() => {
    if (!token?.expiresAt) return;
    const expiresAt = Date.parse(token.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const refreshDelay = Math.max(0, expiresAt - Date.now() - 90_000);
    const timeout = window.setTimeout(() => {
      void (async () => {
        await flushProgress();
        setStatus("loading");
        setMessage("Der sichere Videozugriff wird erneuert …");
        setToken(null);
        setRequestKey((key) => key + 1);
      })();
    }, refreshDelay);
    return () => window.clearTimeout(timeout);
  }, [flushProgress, token?.expiresAt]);

  useEffect(() => {
    const persistWhenHidden = () => {
      // The page still exists when only the tab becomes hidden, so keep the
      // normal response handling and surface a newly unlocked quiz on return.
      if (document.visibilityState === "hidden") void flushProgress();
    };
    const persistBeforeUnload = () => void flushProgress(true);
    document.addEventListener("visibilitychange", persistWhenHidden);
    window.addEventListener("beforeunload", persistBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", persistWhenHidden);
      window.removeEventListener("beforeunload", persistBeforeUnload);
      void flushProgress(true);
    };
  }, [flushProgress]);

  return (
    <section
      id="kursvideo"
      aria-labelledby="video-heading"
      className="scroll-mt-24"
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111820] shadow-[0_18px_48px_rgba(17,24,32,.22)]">
        <div className="relative aspect-video">
          {status === "loading" ? (
            <div className="absolute inset-0 grid place-items-center text-white">
              <div className="text-center">
                <LoaderCircle
                  aria-hidden="true"
                  className="mx-auto size-8 animate-spin text-[#dfc79f]"
                />
                <p className="mt-4 text-sm font-semibold">
                  Geschützten Videoplayer laden …
                </p>
              </div>
            </div>
          ) : null}
          {status === "error" ? (
            <div className="absolute inset-0 grid place-items-center px-6 text-white">
              <div className="max-w-md text-center">
                <AlertCircle
                  aria-hidden="true"
                  className="mx-auto size-8 text-[#dfc79f]"
                />
                <h2
                  id="video-heading"
                  className="mt-4 font-serif text-xl font-semibold"
                >
                  Video gerade nicht verfügbar
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  {message}
                </p>
                <Button
                  variant="gold"
                  size="sm"
                  className="mt-5"
                  onClick={() => {
                    setStatus("loading");
                    setMessage(null);
                    setToken(null);
                    setRequestKey((key) => key + 1);
                  }}
                >
                  <RefreshCw aria-hidden="true" className="size-4" /> Erneut
                  versuchen
                </Button>
              </div>
            </div>
          ) : null}
          {status === "ready" && token ? (
            <>
              <h2 id="video-heading" className="sr-only">
                Kursvideo: {lessonTitle}
              </h2>
              <iframe
                ref={iframeRef}
                src={token.playbackUrl}
                title={`Kursvideo: ${lessonTitle}`}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </>
          ) : null}
        </div>
        <div className="border-t border-white/10 bg-[#171f29] px-4 py-3 text-white sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/65">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-[#dfc79f]"
              />
              Persönlicher, dauerhafter Videozugriff
            </span>
            <span className="text-xs font-bold tabular-nums">
              {readOnlyPreview
                ? "Admin-Vorschau · Fortschritt aus"
                : completedReplay
                  ? "Kurs abgeschlossen · Wiederholung"
                  : `${watchedPercent} % angesehen`}
            </span>
          </div>
          {!progressReadOnly ? (
            <ProgressBar
              value={watchedPercent}
              label="Videofortschritt"
              showValue={false}
              className="mt-3"
            />
          ) : null}
        </div>
      </div>
      {message && status !== "error" ? (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#dbbf93] bg-[#fffaf2] p-3 text-xs leading-5 text-[#795f35]">
          <p className="flex min-w-0 flex-1 items-start gap-2" role="status">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {message}
          </p>
          {progressSaveFailed ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void flushProgress()}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Erneut speichern
            </Button>
          ) : null}
        </div>
      ) : null}
      {quizAvailable && !progressReadOnly ? (
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-success/25 bg-success/[.065] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex items-start gap-3"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-success"
            />
            <div>
              <p className="text-sm font-bold text-navy">
                90&nbsp;% erreicht – Wissenstest freigeschaltet
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Dein Fortschritt wurde bestätigt. Du kannst den Wissenstest
                jetzt beginnen.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() =>
              window.dispatchEvent(new Event(`quiz-navigate:${lessonId}`))
            }
          >
            <ClipboardCheck aria-hidden="true" className="size-4" />
            Wissenstest starten
          </Button>
        </div>
      ) : !completedReplay ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Play aria-hidden="true" className="size-3.5" />
          Der Wissenstest wird ab 90 % erreichtem Videofortschritt
          freigeschaltet.
        </p>
      ) : null}
    </section>
  );
}
