export interface CertificateStateRow {
  status: string;
  created_at?: string | null;
  issued_at?: string | null;
}

export interface CertificateFileState extends CertificateStateRow {
  file_key?: string | null;
  file_sha256?: string | null;
}

const participantPriority: Record<string, number> = {
  valid: 0,
  revoked: 1,
  generating: 2,
  replacing: 2,
  failed: 3,
};

/**
 * A failed or in-flight replacement must not hide an older certificate that
 * is still valid (or its effective revoked state). Rows are otherwise newest
 * first within the same status class.
 */
export function selectEffectiveCertificate<T extends CertificateStateRow>(
  rows: readonly T[],
): T | null {
  return (
    [...rows].sort((left, right) => {
      const priorityDifference =
        (participantPriority[left.status] ?? 99) -
        (participantPriority[right.status] ?? 99);
      if (priorityDifference !== 0) return priorityDifference;
      const leftTime = Date.parse(left.created_at ?? left.issued_at ?? "") || 0;
      const rightTime =
        Date.parse(right.created_at ?? right.issued_at ?? "") || 0;
      return rightTime - leftTime;
    })[0] ?? null
  );
}

export function certificateFileAvailable<T extends CertificateFileState>(
  certificate: T | null | undefined,
  allowedStatuses: readonly string[],
): certificate is T & { file_key: string; file_sha256: string } {
  const hash = certificate?.file_sha256 ?? "";
  return Boolean(
    certificate &&
    allowedStatuses.includes(certificate.status) &&
    certificate.file_key?.trim() &&
    /^[a-f0-9]{64}$/.test(hash) &&
    !/^0+$/.test(hash),
  );
}

export function certificateDownloadAvailable<T extends CertificateFileState>(
  certificate: T | null | undefined,
): certificate is T & { file_key: string; file_sha256: string } {
  return certificateFileAvailable(certificate, ["valid"]);
}
