import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

describe("certificate Unicode rendering", () => {
  it.each(["İpek Şahin", "Łukasz Żółć", "Олена Іваненко"])(
    "renders %s with the embedded Unicode font",
    async (participantName) => {
      const { buildCertificatePdf } = await import("@/lib/server/certificate");
      const pdf = await buildCertificatePdf({
        participantName,
        certificateNumber: "SWV-2026-ABC123",
        issuedAt: new Date("2026-07-21T10:00:00.000Z"),
        courseVersion: "2026.1",
        issuerName: "Schulung Wimpernverlängerung",
        signatoryName: "Fachliche Leitung",
        verificationUrl:
          "https://schulung-wimpernverlaengerung.de/zertifikat/pruefen?nummer=SWV-2026-ABC123",
      });

      expect(Buffer.from(pdf).subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(pdf.byteLength).toBeGreaterThan(10_000);
    },
  );

  it("wraps a valid 160-character worst-case name inside the printable width", async () => {
    const { fitCertificateName } = await import("@/lib/server/certificate");
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const bytes = await readFile(
      join(
        process.cwd(),
        "node_modules",
        "dejavu-fonts-ttf",
        "ttf",
        "DejaVuSerif-Bold.ttf",
      ),
    );
    const font = await document.embedFont(new Uint8Array(bytes), {
      subset: true,
    });
    const maxWidth = 841.89 - 150;
    const layout = fitCertificateName(
      "W".repeat(160),
      (text, size) => font.widthOfTextAtSize(text, size),
      maxWidth,
    );

    expect(layout.lines.length).toBeLessThanOrEqual(5);
    expect(layout.lines.join("")).toHaveLength(160);
    for (const line of layout.lines) {
      expect(font.widthOfTextAtSize(line, layout.size)).toBeLessThanOrEqual(
        maxWidth,
      );
    }
  });

  it("keeps the required logo, complete topics, seal and text verification URL in the PDF contract", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "server", "certificate.ts"),
      "utf8",
    );
    expect(source).toContain("const logoSweepSegments");
    expect(source).toContain("const logoOuterLashSegments");
    expect(source).toContain("Pflege vor und nach dem Styling");
    expect(source).toMatch(/const sealCaption = ["']ZERTIFIKAT["']/);
    expect(source).toContain("`Verifikation: ${input.verificationUrl}`");
  });
});
