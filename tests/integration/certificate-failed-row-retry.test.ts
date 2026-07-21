// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  insertPayloads: [] as Record<string, unknown>[],
  updatePayloads: [] as Record<string, unknown>[],
  eqCalls: [] as [string, unknown][],
  certificateCalls: 0,
  sendCompleted: vi.fn(),
  sendCertificate: vi.fn(),
}));

function builder<T>(result: T) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn((column: string, value: unknown) => {
    state.eqCalls.push([column, value]);
    return query;
  });
  for (const method of ["in", "order", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.insert = vi.fn((payload: Record<string, unknown>) => {
    state.insertPayloads.push(payload);
    return query;
  });
  query.update = vi.fn((payload: Record<string, unknown>) => {
    state.updatePayloads.push(payload);
    return query;
  });
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (
    resolve: (value: T) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: state.from,
    storage: { from: state.storageFrom },
  }),
}));

vi.mock("@/lib/server/email", () => ({
  sendCourseCompletedEmail: state.sendCompleted,
  sendCertificateReadyEmail: state.sendCertificate,
}));

import { finalizeCourseCompletion } from "@/lib/server/certificate";

const userId = "20000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const snapshotId = "50000000-0000-4000-8000-000000000001";
const confirmationId = "60000000-0000-4000-8000-000000000001";
const certificateId = "70000000-0000-4000-8000-000000000001";
const fileKey = `${userId}/${courseId}/SWV-2026-FAILED.pdf`;

const failedCertificate = {
  id: certificateId,
  certificate_number: "SWV-2026-FAILED",
  participant_name: "Erika Mustermann",
  file_key: fileKey,
  file_sha256: "0".repeat(64),
  issued_at: "2026-07-21T09:00:00.000Z",
  status: "failed",
  updated_at: "2026-07-21T09:01:00.000Z",
  completion_snapshot_id: snapshotId,
};

describe("atomarer Retry einer fehlgeschlagenen Zertifikatsausstellung", () => {
  beforeEach(() => {
    vi.stubEnv("CERTIFICATE_ISSUER_NAME", "Schulung Wimpernverlängerung");
    vi.stubEnv("CERTIFICATE_SIGNATORY_NAME", "Fachliche Leitung");
    vi.stubEnv(
      "CERTIFICATE_VERIFICATION_SECRET",
      "test-secret-with-at-least-thirty-two-characters",
    );
    state.insertPayloads.length = 0;
    state.updatePayloads.length = 0;
    state.eqCalls.length = 0;
    state.certificateCalls = 0;
    state.sendCompleted.mockReset().mockResolvedValue(true);
    state.sendCertificate.mockReset().mockResolvedValue(true);
    state.upload.mockReset().mockResolvedValue({ error: null });
    state.storageFrom.mockReset().mockReturnValue({ upload: state.upload });
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
          data: [{ id: snapshotId, course_version: "2026.1" }],
          error: null,
        });
      }
      if (table === "certificate_issuance_confirmations") {
        return builder({
          data: {
            id: confirmationId,
            participant_name: "Erika Mustermann",
            completion_snapshot_id: snapshotId,
          },
          error: null,
        });
      }
      if (table === "certificates") {
        state.certificateCalls += 1;
        if (state.certificateCalls === 1) {
          return builder({ data: failedCertificate, error: null });
        }
        if (state.certificateCalls === 2) {
          return builder({ data: null, error: null, count: 0 });
        }
        if (state.certificateCalls === 3) {
          return builder({
            data: { ...failedCertificate, status: "generating" },
            error: null,
          });
        }
        if (state.certificateCalls === 4) {
          return builder({ data: { id: certificateId }, error: null });
        }
      }
      throw new Error(
        `Unerwarteter Datenbankaufruf: ${table} #${state.certificateCalls}`,
      );
    });
  });

  it("claimt dieselbe Zeile per CAS und überschreibt nur deren nicht finalisiertes Storage-Objekt", async () => {
    const result = await finalizeCourseCompletion(userId, courseId);

    expect(result).toMatchObject({
      state: "valid",
      certificateId,
      certificateEmailSent: true,
    });
    expect(state.insertPayloads).toEqual([]);
    expect(state.updatePayloads[0]).toEqual({
      status: "generating",
      file_sha256: "0".repeat(64),
    });
    expect(state.eqCalls).toContainEqual(["id", certificateId]);
    expect(state.eqCalls).toContainEqual(["status", "failed"]);
    expect(state.eqCalls).toContainEqual([
      "issuance_confirmation_id",
      confirmationId,
    ]);
    expect(state.upload).toHaveBeenCalledWith(fileKey, expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: true,
    });
    expect(state.updatePayloads[1]).toMatchObject({ status: "valid" });
  });
});
