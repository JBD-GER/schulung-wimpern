// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const userId = "20000000-0000-4000-8000-000000000001";
const lessonId = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const sessionId = "70000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  adminPreview: false,
  duration: 1_000,
  session: { id: "70000000-0000-4000-8000-000000000001" } as {
    id: string;
  } | null,
  rpcError: null as null | { code: string },
  watchedSeconds: 900,
  videoCompleted: true,
  quizCount: 5,
  requireEnrollment: vi.fn(),
  assertUnlocked: vi.fn(),
  rpc: vi.fn(),
}));

function resultBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "is", "gt", "order", "limit"])
    builder[method] = () => builder;
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  return builder;
}

function countBuilder() {
  const result = () => ({ count: state.quizCount, error: null });
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.then = (
    resolve: (value: ReturnType<typeof result>) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result()).then(resolve, reject);
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "lessons") {
      return {
        select: vi.fn(() =>
          resultBuilder({
            data: {
              id: lessonId,
              course_id: courseId,
              duration_seconds: state.duration,
              status: "published",
            },
            error: null,
          }),
        ),
      };
    }
    if (table === "courses") {
      return {
        select: vi.fn(() =>
          resultBuilder({ data: { version: "2026.1" }, error: null }),
        ),
      };
    }
    if (table === "video_access_sessions") {
      return {
        select: vi.fn(() =>
          resultBuilder({ data: state.session, error: null }),
        ),
      };
    }
    if (table === "quiz_questions") {
      return { select: vi.fn(() => countBuilder()) };
    }
    throw new Error(`Unexpected table in progress test: ${table}`);
  }),
  rpc: state.rpc,
}));

vi.mock("@/lib/server/auth", () => ({
  isAdminUser: vi.fn(async () => state.adminPreview),
  requireUser: vi.fn(async () => ({
    id: userId,
    email: "erika@example.de",
  })),
}));
vi.mock("@/lib/server/access", () => ({
  requireEnrollment: state.requireEnrollment,
  assertLessonUnlocked: state.assertUnlocked,
  enrollmentHasDurableCompletion: (enrollment: {
    completed_course_version?: string | null;
  }) => Boolean(enrollment.completed_course_version),
}));
vi.mock("@/lib/server/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));

import { PUT } from "@/app/api/progress/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/progress", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ lessonId, ...body }),
  });
}

describe("playhead-basierter Videofortschritt", () => {
  beforeEach(() => {
    state.adminPreview = false;
    state.duration = 1_000;
    state.session = { id: sessionId };
    state.rpcError = null;
    state.watchedSeconds = 900;
    state.videoCompleted = true;
    state.quizCount = 5;
    state.requireEnrollment.mockReset().mockResolvedValue({
      id: "enrollment-1",
      status: "active",
      completed_course_version: null,
    });
    state.assertUnlocked.mockReset();
    state.rpc.mockReset().mockImplementation(async () => ({
      data: [
        {
          watched_seconds: state.watchedSeconds,
          video_completed: state.videoCompleted,
        },
      ],
      error: state.rpcError,
    }));
    admin.from.mockClear();
  });

  it("speichert einen erlaubten Sprung als höchsten erreichten Abspielpunkt", async () => {
    const response = await PUT(request({ currentTime: 900, duration: 1_000 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      watchedSeconds: 900,
      watchedPercent: 90,
      videoCompleted: true,
      quizAvailable: true,
    });
    expect(state.rpc).toHaveBeenCalledWith("record_video_progress", {
      progressing_user_id: userId,
      access_session_id: sessionId,
      target_lesson_id: lessonId,
      reported_position: 900,
    });
    expect(state.requireEnrollment).toHaveBeenCalledWith(userId, courseId);
    expect(state.assertUnlocked).toHaveBeenCalledWith(userId, lessonId);
  });

  it("verwirft eine stark abweichende Videolaufzeit vor dem Speichern", async () => {
    const response = await PUT(request({ currentTime: 900, duration: 1_200 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_duration");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("verlangt weiterhin eine aktive, versionsgebundene Videositzung", async () => {
    state.session = null;

    const response = await PUT(request({ currentTime: 500, duration: 1_000 }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("video_session_required");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("bleibt in der Admin-Vorschau vollständig schreibgeschützt", async () => {
    state.adminPreview = true;

    const response = await PUT(request({ currentTime: 500, duration: 1_000 }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("admin_preview_read_only");
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("verändert bei einem bereits abgeschlossenen Kurs keinen Fortschritt mehr", async () => {
    state.requireEnrollment.mockResolvedValueOnce({
      id: "enrollment-1",
      status: "active",
      completed_course_version: "2026.1",
    });

    const response = await PUT(request({ currentTime: 500, duration: 1_000 }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("completed_replay_read_only");
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
