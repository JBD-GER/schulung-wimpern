// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireEnrollment: vi.fn(),
  enforceRateLimit: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireUser: state.requireUser }));
vi.mock("@/lib/server/access", () => ({
  requireEnrollment: state.requireEnrollment,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: state.enforceRateLimit,
}));
vi.mock("@/lib/server/certificate", () => ({
  confirmCertificateIssuance: state.confirm,
}));

import { POST } from "@/app/api/certificate/confirm/route";

const userId = "20000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";

function request(
  body: unknown = {
    participantName: "Erika Mustermann",
    singleIssuanceConfirmed: true,
    correctionFeeNoticeConfirmed: true,
  },
  origin = "http://localhost:3000",
) {
  return new Request("http://localhost:3000/api/certificate/confirm", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site":
        origin === "http://localhost:3000" ? "same-origin" : "cross-site",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Verbindliche Zertifikatsbestätigung", () => {
  beforeEach(() => {
    state.requireUser.mockReset().mockResolvedValue({
      id: userId,
      email: "erika@example.de",
    });
    state.requireEnrollment.mockReset().mockResolvedValue({
      id: "enrollment-1",
      user_id: userId,
      course_id: courseId,
      status: "completed",
    });
    state.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    state.confirm.mockReset().mockResolvedValue({
      state: "valid",
      certificateId: "certificate-1",
      completionEmailSent: true,
      certificateEmailSent: true,
    });
  });

  it("stellt erst nach beiden ausdrücklichen Bestätigungen aus", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "valid",
      certificateId: "certificate-1",
    });
    expect(state.enforceRateLimit).toHaveBeenCalledWith({
      bucket: "certificate-issuance-confirmation",
      subject: userId,
      maximum: 5,
      windowSeconds: 3600,
    });
    expect(state.confirm).toHaveBeenCalledWith(
      userId,
      courseId,
      "Erika Mustermann",
    );
  });

  it("akzeptiert denselben bestätigten Namen bei einem sicheren POST-Retry idempotent", async () => {
    const first = await POST(request());
    const retry = await POST(request());

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      state: "valid",
      certificateId: "certificate-1",
    });
    await expect(retry.json()).resolves.toMatchObject({
      state: "valid",
      certificateId: "certificate-1",
    });
    expect(state.confirm).toHaveBeenCalledTimes(2);
    expect(state.confirm).toHaveBeenNthCalledWith(
      2,
      userId,
      courseId,
      "Erika Mustermann",
    );
  });

  it.each([
    {
      participantName: "Erika Mustermann",
      singleIssuanceConfirmed: false,
      correctionFeeNoticeConfirmed: true,
    },
    {
      participantName: "Erika Mustermann",
      singleIssuanceConfirmed: true,
      correctionFeeNoticeConfirmed: false,
    },
    {
      participantName: "Erika",
      singleIssuanceConfirmed: true,
      correctionFeeNoticeConfirmed: true,
    },
  ])("weist unvollständige Bestätigungen fail-closed ab", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it("weist Cross-Site-Aufrufe vor Authentifizierung und Mutation ab", async () => {
    const response = await POST(request(undefined, "https://evil.example"));

    expect(response.status).toBe(403);
    expect(state.requireUser).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it("meldet eine bereits erfolgte Ausstellung eindeutig statt erneut auszustellen", async () => {
    state.confirm.mockResolvedValueOnce({
      state: "history_blocked",
      certificateId: null,
      completionEmailSent: true,
      certificateEmailSent: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "certificate_already_issued",
    });
    expect(state.confirm).toHaveBeenCalledTimes(1);
  });
});
