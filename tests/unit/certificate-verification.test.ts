// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  certificateVerificationProof,
  validCertificateVerificationProof,
} from "@/lib/server/certificate-verification";

afterEach(() => {
  delete process.env.CERTIFICATE_VERIFICATION_SECRET;
});

describe("Zertifikats-QR-Nachweis", () => {
  it("signiert die Zertifikatsnummer und weist manipulierte QR-Parameter ab", () => {
    process.env.CERTIFICATE_VERIFICATION_SECRET =
      "a-secure-test-secret-with-at-least-32-characters";
    const number = "SWV-2026-ABC123";
    const proof = certificateVerificationProof(number);

    expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(validCertificateVerificationProof(number, proof)).toBe(true);
    expect(validCertificateVerificationProof("SWV-2026-ABC124", proof)).toBe(
      false,
    );
  });
});
