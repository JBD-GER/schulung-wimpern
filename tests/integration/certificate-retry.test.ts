// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireEnrollment: vi.fn(),
  enforceRateLimit: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireUser: state.requireUser }));
vi.mock("@/lib/server/access", () => ({
  requireEnrollment: state.requireEnrollment,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: state.enforceRateLimit,
}));
vi.mock("@/lib/server/certificate", () => ({
  finalizeCourseCompletion: state.finalize,
}));
vi.mock("@/lib/server/queries", () => ({ getCertificateData: vi.fn() }));

import { POST } from "@/app/api/certificate/route";
import { HttpError } from "@/lib/server/http";

const userId = "20000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";

function request(origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/certificate", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site":
        origin === "http://localhost:3000" ? "same-origin" : "cross-site",
    },
  });
}

describe("Zertifikats-Retry", () => {
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
    state.finalize.mockReset().mockResolvedValue({
      state: "valid",
      certificateId: "certificate-1",
      completionEmailSent: true,
      certificateEmailSent: true,
    });
  });

  it("prüft Nutzer, Rate-Limit und dessen aktiven Kurs vor der idempotenten Finalisierung", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      state: "valid",
      certificateId: "certificate-1",
    });
    expect(state.enforceRateLimit).toHaveBeenCalledWith({
      bucket: "certificate-finalization-retry",
      subject: userId,
      maximum: 6,
      windowSeconds: 3600,
    });
    expect(state.requireEnrollment).toHaveBeenCalledWith(userId);
    expect(state.finalize).toHaveBeenCalledWith(userId, courseId);
  });

  it("liefert während einer bereits laufenden Ausstellung 202 statt einen Fehlstatus", async () => {
    state.finalize.mockResolvedValueOnce({
      state: "generating",
      certificateId: "certificate-1",
      completionEmailSent: true,
      certificateEmailSent: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      state: "generating",
      certificateId: "certificate-1",
    });
  });

  it.each([
    [
      "not_eligible",
      "certificate_not_eligible",
      "vollständig belegte Kursabschluss",
    ],
    [
      "confirmation_required",
      "certificate_confirmation_required",
      "bestätige zuerst den Namen",
    ],
    [
      "history_blocked",
      "certificate_history_review_required",
      "kontrollierte Prüfung",
    ],
  ])(
    "weist den kontrollierten Zustand %s ohne falsche Erfolgsmeldung ab",
    async (finalizationState, errorCode, messageFragment) => {
      state.finalize.mockResolvedValueOnce({
        state: finalizationState,
        certificateId: null,
        completionEmailSent: false,
        certificateEmailSent: false,
      });

      const response = await POST(request());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toMatchObject({ ok: false, error: errorCode });
      expect(body.message).toContain(messageFragment);
    },
  );

  it("weist Cross-Site-Aufrufe ab, bevor Authentifizierung oder Finalisierung beginnen", async () => {
    const response = await POST(request("https://evil.example"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "csrf_rejected",
    });
    expect(state.requireUser).not.toHaveBeenCalled();
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("reicht Auth- und Rate-Limit-Fehler unverändert als sichere API-Fehler weiter", async () => {
    state.requireUser.mockRejectedValueOnce(
      new HttpError(401, "Bitte melde dich an.", "unauthorized"),
    );
    const unauthorized = await POST(request());
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({
      error: "unauthorized",
    });
    expect(state.requireEnrollment).not.toHaveBeenCalled();

    state.enforceRateLimit.mockRejectedValueOnce(
      new HttpError(429, "Zu viele Anfragen.", "rate_limited"),
    );
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
    expect(state.finalize).not.toHaveBeenCalled();
  });
});
