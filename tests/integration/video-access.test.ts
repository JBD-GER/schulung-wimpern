// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  userError: null as unknown,
  enrollmentError: null as unknown,
  unlockError: null as unknown,
  adminPreview: false,
  createToken: vi.fn(),
  requireEnrollment: vi.fn(),
  assertUnlocked: vi.fn(),
}));

function resultBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "order", "limit"])
    builder[method] = () => builder;
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "lessons") {
      return {
        select: vi.fn(() =>
          resultBuilder({
            data: {
              id: "30000000-0000-4000-8000-000000000001",
              course_id: "40000000-0000-4000-8000-000000000001",
              stream_video_uid: "stream-private-uid",
              status: "published",
            },
            error: null,
          }),
        ),
      };
    }
    if (table === "lesson_progress") {
      return {
        select: vi.fn(() =>
          resultBuilder({
            data: { watched_seconds: 120, course_version: "2026.1" },
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
      return { insert: vi.fn(async () => ({ error: null })) };
    }
    throw new Error(`Unexpected table in video test: ${table}`);
  }),
}));

vi.mock("@/lib/server/auth", () => ({
  isAdminUser: vi.fn(async () => state.adminPreview),
  requireUser: vi.fn(async () => {
    if (state.userError) throw state.userError;
    return {
      id: "20000000-0000-4000-8000-000000000001",
      email: "erika@example.de",
    };
  }),
}));
vi.mock("@/lib/server/access", () => ({
  requireEnrollment: state.requireEnrollment,
  assertLessonUnlocked: state.assertUnlocked,
}));
vi.mock("@/lib/server/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));
vi.mock("@/lib/env", () => ({ optionalEnv: () => "3600" }));
vi.mock("@/lib/server/cloudflare", () => ({
  createStreamToken: state.createToken,
  streamPlaybackUrl: (token: string) =>
    `https://customer.cloudflarestream.com/${token}/iframe`,
}));

import { POST } from "@/app/api/video-token/route";
import { HttpError } from "@/lib/server/http";

const lessonId = "30000000-0000-4000-8000-000000000001";

function request() {
  return new Request("http://localhost:3000/api/video-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ lessonId }),
  });
}

describe("privater Videozugriff", () => {
  beforeEach(() => {
    state.userError = null;
    state.enrollmentError = null;
    state.unlockError = null;
    state.adminPreview = false;
    state.createToken.mockReset().mockResolvedValue("signed-short-lived-token");
    state.requireEnrollment.mockReset().mockImplementation(async () => {
      if (state.enrollmentError) throw state.enrollmentError;
      return { id: "enrollment-1" };
    });
    state.assertUnlocked.mockReset().mockImplementation(async () => {
      if (state.unlockError) throw state.unlockError;
    });
    admin.from.mockClear();
  });

  it("gibt unangemeldet keinen Token aus", async () => {
    state.userError = new HttpError(
      401,
      "Bitte melde dich an.",
      "authentication_required",
    );
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(state.createToken).not.toHaveBeenCalled();
  });

  it("gibt ohne Enrollment keinen Token aus", async () => {
    state.enrollmentError = new HttpError(
      403,
      "Kein Zugang.",
      "enrollment_required",
    );
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(state.createToken).not.toHaveBeenCalled();
  });

  it("gibt für eine gesperrte Lektion keinen Token aus", async () => {
    state.unlockError = new HttpError(403, "Gesperrt.", "lesson_locked");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(state.createToken).not.toHaveBeenCalled();
  });

  it("liefert nur nach allen Prüfungen eine kurzlebige signierte Wiedergabe", async () => {
    const before = Date.now();
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.requireEnrollment).toHaveBeenCalledWith(
      "20000000-0000-4000-8000-000000000001",
      "40000000-0000-4000-8000-000000000001",
    );
    expect(state.assertUnlocked).toHaveBeenCalledWith(
      "20000000-0000-4000-8000-000000000001",
      lessonId,
    );
    expect(state.createToken).toHaveBeenCalledWith(
      "stream-private-uid",
      expect.any(Date),
    );
    const expiry = new Date(body.expiresAt).getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 3_599_000);
    expect(expiry).toBeLessThanOrEqual(before + 3_601_000);
    expect(body.playbackUrl).toContain("signed-short-lived-token");
    expect(admin.from).toHaveBeenCalledWith("courses");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("liefert Admins eine schreibgeschützte Vorschau ohne Videositzung", async () => {
    state.adminPreview = true;

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.previewMode).toBe(true);
    expect(state.requireEnrollment).toHaveBeenCalled();
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalledWith("lesson_progress");
    expect(admin.from).not.toHaveBeenCalledWith("courses");
    expect(admin.from).not.toHaveBeenCalledWith("video_access_sessions");
  });
});
