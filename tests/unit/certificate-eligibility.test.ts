import { describe, expect, it } from "vitest";

import { legacyReviewBlocksNativeCertificateIssuance } from "@/lib/certificate-eligibility";

describe("Zertifikatsfreigabe bei historischen Prüfungen", () => {
  it.each(["pending", "verified", "resolved"])(
    "blockiert den maßgeblichen Status %s",
    (reviewStatus) => {
      expect(
        legacyReviewBlocksNativeCertificateIssuance({
          review_status: reviewStatus,
          mapped_certificate_id: null,
        }),
      ).toBe(true);
    },
  );

  it("blockiert jede bereits zugeordnete Historie unabhängig vom Status", () => {
    expect(
      legacyReviewBlocksNativeCertificateIssuance({
        review_status: "rejected",
        mapped_certificate_id: "certificate-1",
      }),
    ).toBe(true);
  });

  it("lässt einen abgelehnten, nicht zugeordneten Altverweis bei echtem aktuellem Abschluss passieren", () => {
    expect(
      legacyReviewBlocksNativeCertificateIssuance({
        review_status: "rejected",
        mapped_certificate_id: null,
      }),
    ).toBe(false);
  });

  it("blockiert ohne historischen Prüffall nicht", () => {
    expect(legacyReviewBlocksNativeCertificateIssuance(null)).toBe(false);
  });
});
