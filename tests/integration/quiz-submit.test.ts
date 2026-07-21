// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  score: 3,
  passed: false,
  courseCompleted: false,
  rpcError: null as null | { code: string },
  rpc: vi.fn(),
  finalize: vi.fn(),
  requireEnrollment: vi.fn(),
  assertUnlocked: vi.fn(),
  adminPreview: false,
  enrollmentStatus: "active" as "active" | "completed",
  completedCourseVersion: null as string | null,
  attemptSubmittedAt: null as string | null,
}));

function resultBuilder<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  return builder;
}

const admin = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "quiz_attempts") {
      return {
        select: vi.fn(() =>
          resultBuilder({
            data: {
              id: "10000000-0000-4000-8000-000000000001",
              user_id: "20000000-0000-4000-8000-000000000001",
              lesson_id: "30000000-0000-4000-8000-000000000001",
              submitted_at: state.attemptSubmittedAt,
            },
            error: null,
          }),
        ),
      };
    }
    if (table === "lessons") {
      return {
        select: vi.fn((columns: string) =>
          columns === "slug"
            ? resultBuilder({ data: { slug: "lektion-zwei" }, error: null })
            : resultBuilder({
                data: {
                  id: "30000000-0000-4000-8000-000000000001",
                  course_id: "40000000-0000-4000-8000-000000000001",
                  position: 1,
                  title: "Lektion Eins",
                },
                error: null,
              }),
        ),
      };
    }
    throw new Error(`Unexpected table in quiz test: ${table}`);
  }),
  rpc: state.rpc,
}));

vi.mock("@/lib/server/auth", () => ({
  isAdminUser: vi.fn(async () => state.adminPreview),
  requireUser: vi.fn(async () => ({
    id: "20000000-0000-4000-8000-000000000001",
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
vi.mock("@/lib/server/certificate", () => ({
  finalizeCourseCompletion: state.finalize,
}));

import { POST } from "@/app/api/quiz/[lessonId]/submit/route";

const lessonId = "30000000-0000-4000-8000-000000000001";
const attemptId = "10000000-0000-4000-8000-000000000001";
const answers = Array.from({ length: 5 }, (_, index) => ({
  questionId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  optionId: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
}));

function request(body = { attemptId, answers }) {
  return new Request(`http://localhost:3000/api/quiz/${lessonId}/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

describe("Quizabgabe", () => {
  beforeEach(() => {
    state.score = 3;
    state.passed = false;
    state.courseCompleted = false;
    state.adminPreview = false;
    state.enrollmentStatus = "active";
    state.completedCourseVersion = null;
    state.attemptSubmittedAt = null;
    state.rpcError = null;
    state.rpc.mockReset().mockImplementation(async () => ({
      data: {
        score: state.score,
        passed: state.passed,
        course_completed: state.courseCompleted,
      },
      error: state.rpcError,
    }));
    state.finalize.mockReset();
    state.requireEnrollment.mockReset().mockImplementation(async () => ({
      id: "enrollment-1",
      status: state.enrollmentStatus,
      completed_course_version: state.completedCourseVersion,
    }));
    state.assertUnlocked.mockReset().mockResolvedValue(undefined);
    admin.from.mockClear();
  });

  it("lässt bei 3/5 die nächste Lektion gesperrt und erlaubt einen neuen Versuch", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ score: 3, total: 5, passed: false });
    expect(body.nextLessonSlug).toBeUndefined();
    expect(body.topicsToReview).toHaveLength(1);
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("gibt bei 4/5 die nächste Lektion aus", async () => {
    state.score = 4;
    state.passed = true;
    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      score: 4,
      total: 5,
      passed: true,
      nextLessonSlug: "lektion-zwei",
    });
    expect(state.rpc).toHaveBeenCalledWith(
      "submit_quiz_attempt",
      expect.objectContaining({
        submitting_user_id: "20000000-0000-4000-8000-000000000001",
        target_attempt_id: attemptId,
        submitted_answers: answers,
      }),
    );
  });

  it("weist manipulierte Frage-/Optionszuordnungen serverseitig ab", async () => {
    state.rpcError = { code: "22023" };
    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_answers");
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("meldet einen atomar erkannten parallelen Abschluss als geänderten Lernstand", async () => {
    state.rpcError = { code: "23514" };

    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("learning_state_changed");
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("schreibt in der Admin-Vorschau keinen Quizversuch fort", async () => {
    state.adminPreview = true;

    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("admin_preview_read_only");
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("wertet nach abgeschlossenem Kurs keinen zuvor offenen Quizversuch mehr aus", async () => {
    state.enrollmentStatus = "active";
    state.completedCourseVersion = "2026.1";

    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("course_already_completed");
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("liefert eine bereits gespeicherte Abgabe nach Abschluss weiterhin idempotent aus", async () => {
    state.enrollmentStatus = "active";
    state.completedCourseVersion = "2026.1";
    state.attemptSubmittedAt = "2026-07-21T12:00:00.000Z";
    state.score = 4;
    state.passed = true;

    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });

    expect(response.status).toBe(200);
    expect(state.assertUnlocked).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("bewahrt ein atomar bestandenes Abschlussquiz bei Benachrichtigungsfehlern", async () => {
    state.score = 5;
    state.passed = true;
    state.courseCompleted = true;
    state.finalize.mockRejectedValueOnce(new Error("storage unavailable"));

    const response = await POST(request(), {
      params: Promise.resolve({ lessonId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      score: 5,
      passed: true,
      certificateConfirmationRequired: true,
    });
    expect(state.finalize).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["confirmation_required", true],
    ["valid", false],
    ["generating", false],
    ["not_eligible", false],
  ])(
    "meldet nach dem Abschlussquiz die Namensbestätigung für Zustand %s korrekt",
    async (finalizationState, certificateConfirmationRequired) => {
      state.score = 5;
      state.passed = true;
      state.courseCompleted = true;
      state.finalize.mockResolvedValueOnce({
        state: finalizationState,
        certificateId:
          finalizationState === "not_eligible" ? null : "certificate-1",
        completionEmailSent: false,
        certificateEmailSent: false,
      });

      const response = await POST(request(), {
        params: Promise.resolve({ lessonId }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        score: 5,
        passed: true,
        certificateConfirmationRequired,
      });
    },
  );
});
