import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CertificateData } from "@/components/dashboard/data";

const state = vi.hoisted(() => ({
  loadCertificate: vi.fn(),
}));

vi.mock("@/components/dashboard/data", () => ({
  loadCertificate: state.loadCertificate,
}));

vi.mock("@/components/certificate/certificate-retry-button", () => ({
  CertificateRetryButton: () => (
    <button type="button">Erstellung erneut versuchen</button>
  ),
}));

import CertificatePage from "@/app/(protected)/zertifikat/page";

describe("Zertifikats-Empty-State", () => {
  afterEach(() => {
    cleanup();
    state.loadCertificate.mockReset();
  });

  it("zeigt den Retry nach bestätigter Ausstellung trotz abgelehntem Legacy-Verweis", async () => {
    const data: CertificateData = {
      hasAccess: true,
      loadFailed: false,
      completedCount: 7,
      openLessons: [],
      courseCompleted: true,
      downloadAvailable: false,
      retryAvailable: true,
      confirmationRequired: false,
      suggestedCertificateName: "Erika Mustermann",
      confirmedCertificateName: "Erika Mustermann",
      legacyCertificateReview: {
        reportedStatus: "certificate_issued",
        reviewStatus: "rejected",
      },
      certificate: null,
    };
    state.loadCertificate.mockResolvedValue(data);

    render(await CertificatePage());

    expect(
      screen.getByRole("button", { name: "Erstellung erneut versuchen" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Dein Zertifikat wird vorbereitet" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "Der Zertifikatsverweis wurde nicht bestätigt",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Support kontaktieren" }),
    ).not.toBeInTheDocument();
  });
});
