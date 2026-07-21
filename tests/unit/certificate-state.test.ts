// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  certificateDownloadAvailable,
  certificateFileAvailable,
  selectEffectiveCertificate,
} from "@/lib/server/certificate-state";

describe("participant certificate state", () => {
  it("keeps an older valid original effective when a newer replacement failed", () => {
    const effective = selectEffectiveCertificate([
      {
        id: "failed-replacement",
        status: "failed",
        created_at: "2026-07-21T10:00:00.000Z",
      },
      {
        id: "valid-original",
        status: "valid",
        created_at: "2026-07-20T10:00:00.000Z",
      },
    ]);

    expect(effective?.id).toBe("valid-original");
  });

  it("keeps a valid original effective while a replacement is still being prepared", () => {
    const effective = selectEffectiveCertificate([
      {
        id: "replacement",
        status: "replacing",
        created_at: "2026-07-21T10:00:00.000Z",
      },
      {
        id: "original",
        status: "valid",
        created_at: "2026-07-20T10:00:00.000Z",
      },
    ]);

    expect(effective?.id).toBe("original");
  });

  it("uses the newest row within the same effective status class", () => {
    const effective = selectEffectiveCertificate([
      { id: "old", status: "failed", created_at: "2026-07-20T10:00:00.000Z" },
      { id: "new", status: "failed", created_at: "2026-07-21T10:00:00.000Z" },
    ]);

    expect(effective?.id).toBe("new");
  });

  it("requires a final non-placeholder file before offering a download", () => {
    expect(
      certificateDownloadAvailable({
        status: "valid",
        file_key: "certificates/real.pdf",
        file_sha256: "a".repeat(64),
      }),
    ).toBe(true);
    expect(
      certificateDownloadAvailable({
        status: "valid",
        file_key: "certificates/pending.pdf",
        file_sha256: "0".repeat(64),
      }),
    ).toBe(false);
    expect(
      certificateDownloadAvailable({
        status: "failed",
        file_key: "certificates/failed.pdf",
        file_sha256: "a".repeat(64),
      }),
    ).toBe(false);
  });

  it("allows admins to retrieve finalized historical files but not replacements", () => {
    const finalFile = {
      file_key: "certificates/history.pdf",
      file_sha256: "b".repeat(64),
    };

    expect(
      certificateFileAvailable({ ...finalFile, status: "archived" }, [
        "valid",
        "revoked",
        "archived",
      ]),
    ).toBe(true);
    expect(
      certificateFileAvailable({ ...finalFile, status: "replacing" }, [
        "valid",
        "revoked",
        "archived",
      ]),
    ).toBe(false);
  });
});
