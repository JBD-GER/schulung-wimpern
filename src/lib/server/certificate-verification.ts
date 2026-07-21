import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { requireEnv } from "@/lib/env";

export function certificateVerificationProof(
  certificateNumber: string,
): string {
  const secret = requireEnv("CERTIFICATE_VERIFICATION_SECRET");
  if (secret.length < 32) {
    throw new Error(
      "CERTIFICATE_VERIFICATION_SECRET muss mindestens 32 Zeichen lang sein.",
    );
  }
  return createHmac("sha256", secret)
    .update(certificateNumber)
    .digest("base64url");
}

export function validCertificateVerificationProof(
  certificateNumber: string,
  proof: string,
): boolean {
  const expected = certificateVerificationProof(certificateNumber);
  const receivedBytes = Buffer.from(proof);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}
