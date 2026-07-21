// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  from: vi.fn(),
  sendCompleted: vi.fn(),
  sendCertificate: vi.fn(),
  snapshot: {
    id: "50000000-0000-4000-8000-000000000001",
    course_version: "2026.1",
  } as { id: string; course_version: string } | null,
}));

function builder<T>(result: { data: T; error: null }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (
    resolve: (value: { data: T; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: state.from }),
}));
vi.mock("@/lib/server/email", () => ({
  sendCourseCompletedEmail: state.sendCompleted,
  sendCertificateReadyEmail: state.sendCertificate,
}));

import { finalizeCourseCompletion } from "@/lib/server/certificate";

const userId = "20000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";

describe("Zertifikatsfinalisierung vor der Namensbestätigung", () => {
  beforeEach(() => {
    state.snapshot = {
      id: "50000000-0000-4000-8000-000000000001",
      course_version: "2026.1",
    };
    state.sendCompleted.mockReset().mockResolvedValue(true);
    state.sendCertificate.mockReset();
    state.from.mockReset().mockImplementation((table: string) => {
      if (table === "courses") {
        return builder({
          data: { id: courseId, title: "Kurs", version: "2026.1" },
          error: null,
        });
      }
      if (table === "profiles") {
        return builder({
          data: {
            first_name: "Erika",
            last_name: "Mustermann",
            certificate_name: "Erika Mustermann",
            email: "erika@example.de",
          },
          error: null,
        });
      }
      if (table === "course_completion_snapshots") {
        return builder({
          data: state.snapshot ? [state.snapshot] : [],
          error: null,
        });
      }
      if (table === "certificate_issuance_confirmations") {
        return builder({ data: null, error: null });
      }
      throw new Error(`Unerwartete Tabelle vor Bestätigung: ${table}`);
    });
  });

  it("sendet nur die idempotente Abschlussmail und erzeugt ohne Bestätigung weder Datensatz noch PDF", async () => {
    const result = await finalizeCourseCompletion(userId, courseId);

    expect(result).toEqual({
      state: "confirmation_required",
      certificateId: null,
      completionEmailSent: true,
      certificateEmailSent: false,
    });
    expect(state.sendCompleted).toHaveBeenCalledWith({
      userId,
      courseId,
      firstName: "Erika",
      email: "erika@example.de",
    });
    expect(state.sendCertificate).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalledWith("certificates");
  });

  it("bleibt ohne belegten Abschluss vollständig gesperrt", async () => {
    state.snapshot = null;

    const result = await finalizeCourseCompletion(userId, courseId);

    expect(result.state).toBe("not_eligible");
    expect(state.sendCompleted).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalledWith(
      "certificate_issuance_confirmations",
    );
    expect(state.from).not.toHaveBeenCalledWith("certificates");
  });
});
