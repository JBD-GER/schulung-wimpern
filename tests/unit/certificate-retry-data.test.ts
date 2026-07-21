// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireEnrollment: vi.fn(),
  getCertificateData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("unexpected redirect");
  }),
}));
vi.mock("@/lib/server/auth", () => ({
  isAdminEmail: vi.fn(() => false),
  requireAdmin: vi.fn(),
  requireUser: state.requireUser,
}));
vi.mock("@/lib/server/access", () => ({
  assertLessonUnlocked: vi.fn(),
  requireEnrollment: state.requireEnrollment,
}));
vi.mock("@/lib/server/queries", () => ({
  getAdminOverview: vi.fn(),
  getCertificateData: state.getCertificateData,
  getDashboardData: vi.fn(),
  getLessonPageData: vi.fn(),
  getProfileData: vi.fn(),
}));

import { loadCertificate } from "@/components/dashboard/data";

describe("Zertifikats-Retry-Daten", () => {
  beforeEach(() => {
    state.requireUser.mockReset().mockResolvedValue({
      id: "user-1",
      email: "erika@example.de",
      user_metadata: {},
    });
    state.requireEnrollment.mockReset().mockResolvedValue({
      id: "enrollment-1",
      user_id: "user-1",
      course_id: "course-1",
      status: "completed",
    });
    state.getCertificateData.mockReset();
  });

  it("transportiert eine serverseitig bestätigte Retry-Berechtigung zur UI", async () => {
    state.getCertificateData.mockResolvedValue({
      completedCount: 7,
      openLessons: [],
      downloadAvailable: false,
      retryAvailable: true,
      certificate: {
        participant_name: "Erika Muster",
        certificate_number: "WV-2026-000001",
        issued_at: "2026-07-21T09:00:00.000Z",
        course_version: "2026.1",
        status: "failed",
      },
      legacyCertificateReview: null,
    });

    const data = await loadCertificate();

    expect(data).toMatchObject({
      hasAccess: true,
      loadFailed: false,
      courseCompleted: true,
      retryAvailable: true,
      downloadAvailable: false,
      certificate: {
        fullName: "Erika Muster",
        number: "WV-2026-000001",
        status: "failed",
      },
    });
  });

  it("schaltet Retry bei fehlendem oder ungültigem Serversignal fail-closed ab", async () => {
    state.getCertificateData.mockResolvedValue({
      completedCount: 7,
      openLessons: [],
      downloadAvailable: false,
      retryAvailable: "yes",
      certificate: null,
      legacyCertificateReview: null,
    });

    const data = await loadCertificate();

    expect(data.courseCompleted).toBe(true);
    expect(data.retryAvailable).toBe(false);
  });

  it("transportiert die serverseitige Bestätigungspflicht und nur den vorgeschlagenen Namen", async () => {
    state.getCertificateData.mockResolvedValue({
      completedCount: 7,
      openLessons: [],
      downloadAvailable: false,
      retryAvailable: false,
      confirmationRequired: true,
      suggestedCertificateName: "Erika Mustermann",
      confirmedCertificateName: null,
      certificate: null,
      legacyCertificateReview: null,
    });

    const data = await loadCertificate();

    expect(data).toMatchObject({
      courseCompleted: true,
      confirmationRequired: true,
      suggestedCertificateName: "Erika Mustermann",
      confirmedCertificateName: null,
      retryAvailable: false,
    });
  });

  it("behält archivierte Zertifikatsverläufe sichtbar und blockiert den Download", async () => {
    state.getCertificateData.mockResolvedValue({
      completedCount: 7,
      openLessons: [],
      downloadAvailable: false,
      retryAvailable: false,
      confirmationRequired: false,
      certificate: {
        participant_name: "Erika Mustermann",
        certificate_number: "SWV-2026-ABC123",
        issued_at: "2026-07-21T09:00:00.000Z",
        course_version: "2026.1",
        status: "archived",
      },
      legacyCertificateReview: null,
    });

    const data = await loadCertificate();

    expect(data).toMatchObject({
      courseCompleted: true,
      downloadAvailable: false,
      retryAvailable: false,
      confirmationRequired: false,
      certificate: {
        number: "SWV-2026-ABC123",
        status: "archived",
      },
    });
  });
});
