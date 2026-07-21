export interface LegacyCertificateReviewState {
  review_status: string;
  mapped_certificate_id: string | null;
}

export function legacyReviewBlocksNativeCertificateIssuance(
  review: LegacyCertificateReviewState | null | undefined,
): boolean {
  return Boolean(
    review &&
    (review.mapped_certificate_id !== null ||
      review.review_status === "pending" ||
      review.review_status === "verified" ||
      review.review_status === "resolved"),
  );
}
