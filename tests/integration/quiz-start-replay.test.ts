// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const lessonId = "30000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  assertUnlocked: vi.fn(),
}));

function resultBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.maybeSingle = async () => result;
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table !== "lessons") throw new Error(`Unexpected table: ${table}`);
    return {
      select: vi.fn(() =>
        resultBuilder({
          data: {
            id: lessonId,
            course_id: courseId,
            status: "published",
          },
          error: null,
        }),
      ),
    };
  }),
}));

vi.mock("@/lib/server/auth", () => ({
  isAdminUser: vi.fn(async () => false),
  requireUser: vi.fn(async () => ({
    id: userId,
    email: "erika@example.de",
  })),
}));
vi.mock("@/lib/server/access", () => ({
  requireEnrollment: vi.fn(async () => ({
    id: "enrollment-1",
    status: "active",
    completed_course_version: "2026.1",
  })),
  assertLessonUnlocked: state.assertUnlocked,
  enrollmentHasDurableCompletion: (enrollment: {
    completed_course_version?: string | null;
  }) => Boolean(enrollment.completed_course_version),
}));
vi.mock("@/lib/server/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => admin }));

import { POST } from "@/app/api/quiz/[lessonId]/start/route";

describe("Quizstart nach abgeschlossenem Kurs", () => {
  it("erzeugt beim reinen Wiederholen keinen neuen Quizversuch", async () => {
    const response = await POST(
      new Request(`http://localhost:3000/api/quiz/${lessonId}/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ lessonId }),
      }),
      { params: Promise.resolve({ lessonId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      error: "course_already_completed",
    });
    expect(response.status).toBe(409);
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledTimes(1);
  });
});
