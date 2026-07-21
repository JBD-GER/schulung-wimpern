import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";

import { getSiteUrl, optionalEnv, requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { sendCertificateReadyEmail, sendCourseCompletedEmail } from "./email";
import { certificateVerificationProof } from "./certificate-verification";
import { HttpError } from "./http";

interface CertificateClaim {
  id: string;
  certificate_number: string;
  participant_name: string;
  file_key: string;
  issued_at: string;
  status: string;
  updated_at: string;
  file_sha256: string;
  completion_snapshot_id: string | null;
}

export interface CourseCompletionFinalization {
  state:
    | "not_eligible"
    | "confirmation_required"
    | "history_blocked"
    | "generating"
    | "valid";
  certificateId: string | null;
  completionEmailSent: boolean;
  certificateEmailSent: boolean;
}

interface CompletionContext {
  course: { id: string; title: string; version: string };
  profile: {
    first_name: string;
    last_name: string;
    certificate_name: string | null;
    email: string;
  };
  eligible: boolean;
  evidenceCourseVersion: string;
  completionSnapshot: { id: string; course_version: string } | null;
}

interface IssuanceConfirmation {
  id: string;
  participant_name: string;
  completion_snapshot_id: string;
}

function certificateNumber(): string {
  return `SWV-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
}

function safeFilename(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `zertifikat-wimpernverlaengerung-${normalized || "teilnehmerin"}.pdf`;
}

function certificateVerificationUrl(certificateNumber: string): string {
  const search = new URLSearchParams({
    nummer: certificateNumber,
    proof: certificateVerificationProof(certificateNumber),
  });
  return `${getSiteUrl()}/zertifikat/pruefen?${search.toString()}`;
}

// Keep font files as runtime assets instead of module imports: Turbopack does
// not transform raw TTF modules. next.config.ts explicitly includes the same
// directory in server output tracing for production deployments.
const fontDirectory = join(
  process.cwd(),
  "node_modules",
  "dejavu-fonts-ttf",
  "ttf",
);
const regularFontPath = join(fontDirectory, "DejaVuSans.ttf");
const boldFontPath = join(fontDirectory, "DejaVuSans-Bold.ttf");
const serifBoldFontPath = join(fontDirectory, "DejaVuSerif-Bold.ttf");

export function fitCertificateName(
  name: string,
  measure: (text: string, size: number) => number,
  maxWidth: number,
): { lines: string[]; size: number; lineHeight: number } {
  const graphemes = (value: string) =>
    [
      ...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(value),
    ].map((item) => item.segment);
  const wrap = (size: number) => {
    const lines: string[] = [];
    let current = "";
    const pushWord = (word: string) => {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, size) <= maxWidth) {
        current = candidate;
        return;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (measure(word, size) <= maxWidth) {
        current = word;
        return;
      }
      let segment = "";
      for (const grapheme of graphemes(word)) {
        const next = `${segment}${grapheme}`;
        if (segment && measure(next, size) > maxWidth) {
          lines.push(segment);
          segment = grapheme;
        } else {
          segment = next;
        }
      }
      current = segment;
    };
    for (const word of name.trim().split(/\s+/u)) pushWord(word);
    if (current) lines.push(current);
    return lines;
  };

  for (let size = 31; size >= 12; size -= 0.5) {
    const lines = wrap(size);
    if (lines.length <= 5) return { lines, size, lineHeight: size * 1.2 };
  }
  // The schema caps names at 160 characters, so this is a defensive fallback.
  return { lines: wrap(12), size: 12, lineHeight: 14.4 };
}

export async function buildCertificatePdf(input: {
  participantName: string;
  certificateNumber: string;
  issuedAt: Date;
  courseVersion: string;
  issuerName: string;
  signatoryName: string;
  verificationUrl: string;
  signaturePath?: string;
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle(`Zertifikat ${input.certificateNumber}`);
  document.setAuthor(input.issuerName);
  document.setSubject(
    "Abschlusszertifikat Online-Schulung Professionelle 1:1 Wimpernverlängerung",
  );
  document.setCreator("schulung-wimpernverlaengerung.de");
  document.setCreationDate(input.issuedAt);
  const page = document.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();
  const [regularBytes, boldBytes, serifBoldBytes] = await Promise.all([
    readFile(regularFontPath),
    readFile(boldFontPath),
    readFile(serifBoldFontPath),
  ]);
  const sans = await document.embedFont(new Uint8Array(regularBytes), {
    subset: true,
  });
  const sansBold = await document.embedFont(new Uint8Array(boldBytes), {
    subset: true,
  });
  const serifBold = await document.embedFont(new Uint8Array(serifBoldBytes), {
    subset: true,
  });
  const navy = rgb(0.114, 0.153, 0.2);
  const gold = rgb(0.69, 0.553, 0.341);
  const ivory = rgb(0.984, 0.976, 0.965);
  const gray = rgb(0.4, 0.439, 0.522);
  page.drawRectangle({ x: 0, y: 0, width, height, color: ivory });
  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: navy,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 31,
    y: 31,
    width: width - 62,
    height: height - 62,
    borderColor: gold,
    borderWidth: 0.8,
  });

  const centered = (
    text: string,
    y: number,
    size: number,
    font = sans,
    color = navy,
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
  };
  const wordmark = "SCHULUNG WIMPERNVERLÄNGERUNG";
  const wordmarkWidth = sansBold.widthOfTextAtSize(wordmark, 10);
  const logoX = (width - wordmarkWidth) / 2 - 19;
  page.drawCircle({
    x: logoX,
    y: 539,
    size: 11,
    color: navy,
    borderColor: gold,
    borderWidth: 1,
  });
  const logoSweepSegments = [
    [
      [-7, -1],
      [-4, 1],
    ],
    [
      [-4, 1],
      [0, 0],
    ],
    [
      [0, 0],
      [4, 1],
    ],
    [
      [4, 1],
      [6.2, 6],
    ],
  ] as const;
  const logoOuterLashSegments = [
    [
      [4.3, 1.4],
      [7, 4.5],
    ],
    [
      [4.7, 1.2],
      [8, 2.5],
    ],
  ] as const;
  for (const [start, end] of [...logoSweepSegments, ...logoOuterLashSegments]) {
    page.drawLine({
      start: { x: logoX + start[0], y: 539 + start[1] },
      end: { x: logoX + end[0], y: 539 + end[1] },
      thickness: 1.15,
      color: gold,
    });
  }
  centered(wordmark, 535, 10, sansBold, gold);
  centered("ZERTIFIKAT", 480, 34, serifBold, navy);
  centered("Hiermit wird bestätigt, dass", 442, 13, sans, gray);
  const participantLayout = fitCertificateName(
    input.participantName,
    (text, size) => serifBold.widthOfTextAtSize(text, size),
    width - 150,
  );
  const firstNameBaseline =
    395 +
    ((participantLayout.lines.length - 1) * participantLayout.lineHeight) / 2;
  participantLayout.lines.forEach((line, index) =>
    centered(
      line,
      firstNameBaseline - index * participantLayout.lineHeight,
      participantLayout.size,
      serifBold,
      navy,
    ),
  );
  const lastNameBaseline =
    firstNameBaseline -
    (participantLayout.lines.length - 1) * participantLayout.lineHeight;
  const nameRuleY = lastNameBaseline - 12;
  page.drawLine({
    start: { x: 75, y: nameRuleY },
    end: { x: width - 75, y: nameRuleY },
    thickness: 0.7,
    color: gold,
  });
  centered("die Online-Schulung", nameRuleY - 33, 13, sans, gray);
  centered(
    "Professionelle 1:1 Wimpernverlängerung",
    nameRuleY - 65,
    20,
    serifBold,
    navy,
  );
  centered("erfolgreich abgeschlossen hat.", nameRuleY - 95, 13, sans, gray);

  const topics = [
    "Rechtliche Absicherung und Datenschutz · Grundlagen der 1:1-Wimpernverlängerung",
    "Pflege vor und nach dem Styling · Materialien und Produkte",
    "Wimpernkleber und Remover · Kundengewinnung",
    "Praktische Visualisierung und Anwendung",
  ];
  topics.forEach((topic, index) =>
    centered(topic, nameRuleY - 132 - index * 16, 9, sans, navy),
  );

  const issuedDate = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "long",
    timeZone: "Europe/Berlin",
  }).format(input.issuedAt);
  page.drawText(`Ausgestellt am ${issuedDate}`, {
    x: 70,
    y: 118,
    size: 9,
    font: sans,
    color: gray,
  });
  page.drawText("Lernumfang: ca. 7 Stunden", {
    x: 70,
    y: 102,
    size: 9,
    font: sans,
    color: gray,
  });
  page.drawText(`Kursversion: ${input.courseVersion}`, {
    x: 70,
    y: 86,
    size: 9,
    font: sans,
    color: gray,
  });
  page.drawText(`Zertifikatsnummer: ${input.certificateNumber}`, {
    x: 70,
    y: 70,
    size: 9,
    font: sansBold,
    color: navy,
  });

  const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, {
    margin: 0,
    width: 240,
    errorCorrectionLevel: "M",
  });
  const qrImage = await document.embedPng(
    new Uint8Array(Buffer.from(qrDataUrl.split(",")[1], "base64")),
  );
  page.drawImage(qrImage, { x: width - 145, y: 62, width: 72, height: 72 });
  page.drawText("Öffentlich prüfen", {
    x: width - 143,
    y: 48,
    size: 8,
    font: sans,
    color: gray,
  });

  // Decorative, deliberately non-official seal; it carries only the product
  // mark and does not imply state recognition or an external accreditation.
  page.drawCircle({
    x: 442,
    y: 104,
    size: 29,
    borderColor: gold,
    borderWidth: 1,
  });
  page.drawCircle({
    x: 442,
    y: 104,
    size: 24,
    borderColor: gold,
    borderWidth: 0.5,
  });
  const sealMark = "SWV";
  page.drawText(sealMark, {
    x: 442 - sansBold.widthOfTextAtSize(sealMark, 10) / 2,
    y: 104,
    size: 10,
    font: sansBold,
    color: gold,
  });
  const sealCaption = "ZERTIFIKAT";
  page.drawText(sealCaption, {
    x: 442 - sans.widthOfTextAtSize(sealCaption, 5.5) / 2,
    y: 94,
    size: 5.5,
    font: sans,
    color: gray,
  });

  const signaturePath = input.signaturePath;
  if (signaturePath) {
    try {
      const bytes = await readFile(signaturePath);
      const image = signaturePath.toLowerCase().endsWith(".png")
        ? await document.embedPng(new Uint8Array(bytes))
        : await document.embedJpg(new Uint8Array(bytes));
      page.drawImage(image, { x: 545, y: 102, width: 120, height: 42 });
    } catch {
      // A text signatory is still rendered; deployment validation should flag a missing file.
    }
  }
  page.drawLine({
    start: { x: 520, y: 95 },
    end: { x: 690, y: 95 },
    thickness: 0.6,
    color: navy,
  });
  page.drawText(input.signatoryName, {
    x: 520,
    y: 80,
    size: 9,
    font: sansBold,
    color: navy,
  });
  page.drawText(input.issuerName, {
    x: 520,
    y: 66,
    size: 8,
    font: sans,
    color: gray,
  });

  let verificationSize = 6;
  const verificationLabel = `Verifikation: ${input.verificationUrl}`;
  while (
    verificationSize > 4 &&
    sans.widthOfTextAtSize(verificationLabel, verificationSize) > width - 140
  ) {
    verificationSize -= 0.25;
  }
  centered(verificationLabel, 39, verificationSize, sans, gray);

  return document.save();
}

async function loadCompletionContext(
  userId: string,
  courseId: string,
  evidenceCourseVersion?: string,
): Promise<CompletionContext> {
  const admin = getSupabaseAdmin();
  let snapshotQuery = admin
    .from("course_completion_snapshots")
    .select("id,course_version")
    .eq("user_id", userId)
    .eq("course_id", courseId);
  snapshotQuery = evidenceCourseVersion
    ? snapshotQuery.eq("course_version", evidenceCourseVersion)
    : snapshotQuery.order("completed_at", { ascending: false });
  const [courseResult, profileResult, snapshotsResult] = await Promise.all([
    admin
      .from("courses")
      .select("id,title,version")
      .eq("id", courseId)
      .single(),
    admin
      .from("profiles")
      .select("first_name,last_name,certificate_name,email")
      .eq("auth_user_id", userId)
      .single(),
    snapshotQuery.limit(1),
  ]);
  if (courseResult.error)
    throw new Error("Certificate course could not be loaded.");
  if (profileResult.error)
    throw new Error("Certificate profile could not be loaded.");
  if (snapshotsResult.error)
    throw new Error("Certificate completion snapshots could not be loaded.");
  if (!courseResult.data || !profileResult.data)
    throw new Error("Certificate completion context is incomplete.");

  const completionSnapshot = snapshotsResult.data?.[0] ?? null;
  const requiredVersion =
    completionSnapshot?.course_version ??
    evidenceCourseVersion ??
    courseResult.data.version;
  return {
    course: courseResult.data,
    profile: profileResult.data,
    eligible: completionSnapshot !== null,
    evidenceCourseVersion: requiredVersion,
    completionSnapshot,
  };
}

async function claimCertificate(
  userId: string,
  courseId: string,
  courseVersion: string,
  completionSnapshotId: string,
  issuanceConfirmationId: string,
  participantName: string,
  allowHistoricalReissue = false,
): Promise<{
  certificate: CertificateClaim;
  claimed: boolean;
  reusedFailedRow: boolean;
} | null> {
  const admin = getSupabaseAdmin();
  const selection =
    "id,certificate_number,participant_name,file_key,file_sha256,issued_at,status,updated_at,completion_snapshot_id";
  const loadExisting = () =>
    admin
      .from("certificates")
      .select(selection)
      .eq("issuance_confirmation_id", issuanceConfirmationId)
      .maybeSingle();
  const existingResult = await loadExisting();
  let existing = existingResult.data;
  if (existingResult.error)
    throw new Error("Existing certificate state could not be verified.");
  if (existing?.status === "valid")
    return {
      certificate: existing as CertificateClaim,
      claimed: false,
      reusedFailedRow: false,
    };

  const { count: finalizedCertificateCount, error: historyError } = await admin
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .in("status", ["valid", "revoked", "archived"]);
  if (historyError)
    throw new Error("Certificate history could not be verified.");
  if (!allowHistoricalReissue && (finalizedCertificateCount ?? 0) > 0)
    return null;

  for (let retry = 0; retry < 4; retry += 1) {
    if (retry > 0) {
      const reloaded = await loadExisting();
      if (reloaded.error)
        throw new Error("Concurrent certificate state could not be verified.");
      existing = reloaded.data;
    }

    if (existing?.status === "valid") {
      return {
        certificate: existing as CertificateClaim,
        claimed: false,
        reusedFailedRow: false,
      };
    }
    if (existing?.status === "revoked" || existing?.status === "archived") {
      return null;
    }
    if (existing?.status === "generating") {
      const stale =
        Date.now() - new Date(existing.updated_at).getTime() > 15 * 60 * 1000;
      if (!stale) {
        return {
          certificate: existing as CertificateClaim,
          claimed: false,
          reusedFailedRow: false,
        };
      }
      const { data: released, error: staleUpdateError } = await admin
        .from("certificates")
        .update({ status: "failed" })
        .eq("id", existing.id)
        .eq("status", "generating")
        .eq("issuance_confirmation_id", issuanceConfirmationId)
        .select(selection)
        .maybeSingle();
      if (staleUpdateError)
        throw new Error("Stale certificate claim could not be released.");
      if (!released) continue;
      existing = released;
    }
    if (existing?.status === "failed") {
      // Compare-and-set keeps retries on the one row authorized by the
      // confirmation. A concurrent retry either wins this update or observes
      // the resulting generating/valid row on the next loop iteration.
      const { data: reclaimed, error: reclaimError } = await admin
        .from("certificates")
        .update({ status: "generating", file_sha256: "0".repeat(64) })
        .eq("id", existing.id)
        .eq("status", "failed")
        .eq("issuance_confirmation_id", issuanceConfirmationId)
        .select(selection)
        .maybeSingle();
      if (reclaimError)
        throw new Error("Failed certificate claim could not be retried.");
      if (!reclaimed) continue;
      return {
        certificate: reclaimed as CertificateClaim,
        claimed: true,
        reusedFailedRow: true,
      };
    }
    if (existing) {
      throw new Error("Certificate claim has an unsupported state.");
    }

    const number = certificateNumber();
    const fileKey = `${userId}/${courseId}/${number}.pdf`;
    const { data, error } = await admin
      .from("certificates")
      .insert({
        user_id: userId,
        course_id: courseId,
        certificate_number: number,
        course_version: courseVersion,
        completion_snapshot_id: completionSnapshotId,
        issuance_confirmation_id: issuanceConfirmationId,
        participant_name: participantName,
        file_key: fileKey,
        file_sha256: "0".repeat(64),
        status: "generating",
      })
      .select(selection)
      .single();
    if (!error && data)
      return {
        certificate: data as CertificateClaim,
        claimed: true,
        reusedFailedRow: false,
      };
    if (!error) throw new Error("Certificate claim did not return a record.");
    if (error.code !== "23505")
      throw new Error("Certificate claim could not be created.");
  }
  throw new Error("Certificate claim could not be created after retrying.");
}

async function loadIssuanceConfirmation(
  userId: string,
  courseId: string,
  completionSnapshotId: string,
): Promise<IssuanceConfirmation | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("certificate_issuance_confirmations")
    .select("id,participant_name,completion_snapshot_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("completion_snapshot_id", completionSnapshotId)
    .maybeSingle();
  if (error)
    throw new Error("Certificate issuance confirmation could not be loaded.");
  return data as IssuanceConfirmation | null;
}

export async function confirmCertificateIssuance(
  userId: string,
  courseId: string,
  participantName: string,
): Promise<CourseCompletionFinalization> {
  const context = await loadCompletionContext(userId, courseId);
  if (!context.eligible || !context.completionSnapshot) {
    return {
      state: "not_eligible",
      certificateId: null,
      completionEmailSent: false,
      certificateEmailSent: false,
    };
  }

  const { data, error } = await getSupabaseAdmin().rpc(
    "confirm_certificate_issuance",
    {
      confirming_user_id: userId,
      target_completion_snapshot_id: context.completionSnapshot.id,
      confirmed_participant_name: participantName,
    },
  );
  if (error) {
    if (error.code === "23514") {
      throw new HttpError(
        409,
        "Der Zertifikatsname wurde bereits verbindlich bestätigt oder ein Zertifikat wurde schon ausgestellt.",
        "certificate_confirmation_immutable",
      );
    }
    if (error.code === "22023") {
      throw new HttpError(
        400,
        "Bitte bestätige einen vollständigen Vor- und Nachnamen.",
        "invalid_certificate_name",
      );
    }
    if (error.code === "P0002") {
      throw new HttpError(
        409,
        "Der belegte Kursabschluss konnte nicht bestätigt werden.",
        "certificate_not_eligible",
      );
    }
    throw new HttpError(
      503,
      "Die Zertifikatsbestätigung konnte gerade nicht sicher gespeichert werden.",
    );
  }
  if (typeof data !== "string") {
    throw new HttpError(
      503,
      "Die Zertifikatsbestätigung wurde nicht vollständig gespeichert.",
    );
  }

  return finalizeCourseCompletion(userId, courseId);
}

export async function finalizeCourseCompletion(
  userId: string,
  courseId: string,
): Promise<CourseCompletionFinalization> {
  const admin = getSupabaseAdmin();
  const { profile, eligible, evidenceCourseVersion, completionSnapshot } =
    await loadCompletionContext(userId, courseId);
  if (!eligible) {
    return {
      state: "not_eligible",
      certificateId: null,
      completionEmailSent: false,
      certificateEmailSent: false,
    };
  }
  const completionEmailSent = await sendCourseCompletedEmail({
    userId,
    courseId,
    firstName: profile.first_name,
    email: profile.email,
  });
  const confirmation = await loadIssuanceConfirmation(
    userId,
    courseId,
    completionSnapshot!.id,
  );
  if (!confirmation) {
    return {
      state: "confirmation_required",
      certificateId: null,
      completionEmailSent,
      certificateEmailSent: false,
    };
  }
  const participantName = confirmation.participant_name;
  const claim = await claimCertificate(
    userId,
    courseId,
    evidenceCourseVersion,
    completionSnapshot!.id,
    confirmation.id,
    participantName,
  );
  if (!claim) {
    return {
      state: "history_blocked",
      certificateId: null,
      completionEmailSent,
      certificateEmailSent: false,
    };
  }
  if (!claim.claimed) {
    if (claim.certificate.status === "valid") {
      const { data, error: downloadError } = await admin.storage
        .from(optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates")
        .download(claim.certificate.file_key);
      if (downloadError || !data)
        throw new Error("Existing certificate PDF could not be loaded.");
      const pdf = new Uint8Array(await data.arrayBuffer());
      if (
        createHash("sha256").update(pdf).digest("hex") !==
        claim.certificate.file_sha256
      ) {
        throw new Error("Existing certificate PDF failed its integrity check.");
      }
      const certificateEmailSent = await sendCertificateReadyEmail({
        userId,
        certificateId: claim.certificate.id,
        firstName: profile.first_name,
        email: profile.email,
        certificateNumber: claim.certificate.certificate_number,
        issuedDate: new Intl.DateTimeFormat("de-DE", {
          dateStyle: "long",
          timeZone: "Europe/Berlin",
        }).format(new Date(claim.certificate.issued_at)),
        pdf,
        filename: safeFilename(participantName),
      });
      return {
        state: "valid",
        certificateId: claim.certificate.id,
        completionEmailSent,
        certificateEmailSent,
      };
    }
    return {
      state: "generating",
      certificateId: claim.certificate.id,
      completionEmailSent,
      certificateEmailSent: false,
    };
  }

  let pdf: Uint8Array;
  let issuedAt: Date;
  try {
    issuedAt = new Date(claim.certificate.issued_at);
    pdf = await buildCertificatePdf({
      participantName,
      certificateNumber: claim.certificate.certificate_number,
      issuedAt,
      courseVersion: evidenceCourseVersion,
      issuerName: requireEnv("CERTIFICATE_ISSUER_NAME"),
      signatoryName: requireEnv("CERTIFICATE_SIGNATORY_NAME"),
      verificationUrl: certificateVerificationUrl(
        claim.certificate.certificate_number,
      ),
      signaturePath: optionalEnv("CERTIFICATE_SIGNATURE_FILE"),
    });
    const hash = createHash("sha256").update(pdf).digest("hex");
    const storageBucket =
      optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates";
    const { error: uploadError } = await admin.storage
      .from(storageBucket)
      .upload(claim.certificate.file_key, pdf, {
        contentType: "application/pdf",
        // A failed activation can leave the object behind. Only a row won by
        // the atomic failed -> generating retry may replace that unfinalized
        // object; a valid certificate is never returned as a writable claim.
        upsert: claim.reusedFailedRow,
      });
    if (uploadError) throw new Error("Certificate upload failed");
    const { data: updatedCertificate, error: updateError } = await admin
      .from("certificates")
      .update({ file_sha256: hash, status: "valid" })
      .eq("id", claim.certificate.id)
      .eq("status", "generating")
      .select("id")
      .maybeSingle();
    if (updateError || !updatedCertificate)
      throw new Error("Certificate record update failed");
  } catch (error) {
    const { error: failureUpdateError } = await admin
      .from("certificates")
      .update({ status: "failed" })
      .eq("id", claim.certificate.id)
      .eq("status", "generating");
    if (failureUpdateError)
      throw new Error(
        "Certificate generation and failure persistence both failed.",
        { cause: error },
      );
    throw error;
  }

  const certificateEmailSent = await sendCertificateReadyEmail({
    userId,
    certificateId: claim.certificate.id,
    firstName: profile.first_name,
    email: profile.email,
    certificateNumber: claim.certificate.certificate_number,
    issuedDate: new Intl.DateTimeFormat("de-DE", {
      dateStyle: "long",
      timeZone: "Europe/Berlin",
    }).format(issuedAt),
    pdf,
    filename: safeFilename(participantName),
  });
  return {
    state: "valid",
    certificateId: claim.certificate.id,
    completionEmailSent,
    certificateEmailSent,
  };
}

export async function reissueCertificate(input: {
  actorId: string;
  certificateId: string;
  participantName?: string;
}): Promise<{ certificate: CertificateClaim; certificateEmailSent: boolean }> {
  const admin = getSupabaseAdmin();
  const { data: original, error: originalError } = await admin
    .from("certificates")
    .select(
      "id,user_id,course_id,course_version,completion_snapshot_id,participant_name,status,updated_at",
    )
    .eq("id", input.certificateId)
    .maybeSingle();
  if (originalError)
    throw new HttpError(
      503,
      "Das ursprüngliche Zertifikat kann gerade nicht geladen werden.",
    );
  if (!original)
    throw new HttpError(
      404,
      "Das ursprüngliche Zertifikat wurde nicht gefunden.",
    );

  const { data: existingReplacement, error: replacementLookupError } =
    await admin
      .from("certificates")
      .select(
        "id,certificate_number,participant_name,file_key,file_sha256,issued_at,status,updated_at,completion_snapshot_id",
      )
      .eq("replaces_certificate_id", original.id)
      .in("status", ["replacing", "valid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  if (replacementLookupError)
    throw new HttpError(
      503,
      "Der Neuausstellungsstatus kann gerade nicht geladen werden.",
    );
  if (existingReplacement?.status === "valid") {
    return {
      certificate: existingReplacement as CertificateClaim,
      certificateEmailSent: true,
    };
  }
  if (existingReplacement?.status === "replacing") {
    const stale =
      Date.now() - new Date(existingReplacement.updated_at).getTime() >
      15 * 60 * 1000;
    if (!stale)
      throw new HttpError(409, "Die Neuausstellung wird bereits vorbereitet.");
    const { error: staleError } = await admin
      .from("certificates")
      .update({ status: "failed" })
      .eq("id", existingReplacement.id)
      .eq("status", "replacing");
    if (staleError)
      throw new HttpError(
        503,
        "Eine veraltete Neuausstellung kann gerade nicht freigegeben werden.",
      );
  }
  if (original.status === "generating") {
    const stale =
      Date.now() - new Date(original.updated_at).getTime() > 15 * 60 * 1000;
    if (!stale) throw new HttpError(409, "Das Zertifikat wird noch erstellt.");
    const { data: released, error: releaseError } = await admin
      .from("certificates")
      .update({ status: "failed" })
      .eq("id", original.id)
      .eq("status", "generating")
      .select("id")
      .maybeSingle();
    if (releaseError)
      throw new HttpError(
        503,
        "Die veraltete Zertifikatserstellung kann gerade nicht freigegeben werden.",
      );
    if (!released)
      throw new HttpError(
        409,
        "Der Zertifikatsstatus wurde zwischenzeitlich geändert.",
      );
    original.status = "failed";
  }
  if (!["valid", "revoked", "failed"].includes(original.status)) {
    throw new HttpError(
      409,
      "Dieses Zertifikat kann nicht erneut ausgestellt werden.",
    );
  }

  const context = await loadCompletionContext(
    original.user_id,
    original.course_id,
    original.course_version,
  );
  if (!context.eligible) {
    throw new HttpError(
      409,
      "Für die Neuausstellung fehlen nachweisbare bestandene Versuche in allen sieben Lektionen.",
    );
  }
  if (
    !original.completion_snapshot_id ||
    context.completionSnapshot?.id !== original.completion_snapshot_id
  ) {
    throw new HttpError(
      409,
      "Das Zertifikat ist nicht an den belegten Kursabschluss gebunden.",
    );
  }
  const participantName = (
    input.participantName ?? original.participant_name
  ).trim();
  if (participantName.length < 2 || participantName.length > 160) {
    throw new HttpError(
      400,
      "Der Zertifikatsname muss zwischen 2 und 160 Zeichen lang sein.",
    );
  }

  let replacement: CertificateClaim | null = null;
  for (let retry = 0; retry < 4 && !replacement; retry += 1) {
    const number = certificateNumber();
    const { data, error } = await admin
      .from("certificates")
      .insert({
        user_id: original.user_id,
        course_id: original.course_id,
        certificate_number: number,
        course_version: original.course_version,
        completion_snapshot_id: original.completion_snapshot_id,
        participant_name: participantName,
        file_key: `${original.user_id}/${original.course_id}/${number}.pdf`,
        file_sha256: "0".repeat(64),
        replaces_certificate_id: original.id,
        status: "replacing",
      })
      .select(
        "id,certificate_number,participant_name,file_key,file_sha256,issued_at,status,updated_at,completion_snapshot_id",
      )
      .single();
    if (!error && data) replacement = data as CertificateClaim;
    else if (!error || error.code !== "23505") {
      throw new HttpError(
        503,
        "Die Neuausstellung konnte nicht beansprucht werden.",
      );
    }
  }
  if (!replacement)
    throw new HttpError(
      503,
      "Für die Neuausstellung konnte keine eindeutige Nummer erzeugt werden.",
    );

  let pdf: Uint8Array;
  try {
    const issuedAt = new Date(replacement.issued_at);
    pdf = await buildCertificatePdf({
      participantName,
      certificateNumber: replacement.certificate_number,
      issuedAt,
      courseVersion: original.course_version,
      issuerName: requireEnv("CERTIFICATE_ISSUER_NAME"),
      signatoryName: requireEnv("CERTIFICATE_SIGNATORY_NAME"),
      verificationUrl: certificateVerificationUrl(
        replacement.certificate_number,
      ),
      signaturePath: optionalEnv("CERTIFICATE_SIGNATURE_FILE"),
    });
    const hash = createHash("sha256").update(pdf).digest("hex");
    const { error: uploadError } = await admin.storage
      .from(optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates")
      .upload(replacement.file_key, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw new Error("Replacement certificate upload failed.");
    const { data: activatedId, error: activationError } = await admin.rpc(
      "activate_certificate_reissue",
      {
        editing_admin_id: input.actorId,
        original_certificate_id: original.id,
        replacement_certificate_id: replacement.id,
        replacement_hash: hash,
        replacement_participant_name: participantName,
      },
    );
    if (activationError || activatedId !== replacement.id) {
      throw new Error("Replacement certificate activation failed.");
    }
    replacement = {
      ...replacement,
      file_sha256: hash,
      participant_name: participantName,
      status: "valid",
    };
  } catch (error) {
    const { error: failureError } = await admin
      .from("certificates")
      .update({ status: "failed" })
      .eq("id", replacement.id)
      .eq("status", "replacing");
    if (failureError)
      throw new Error(
        "Certificate reissue and failure persistence both failed.",
        { cause: error },
      );
    throw error;
  }

  const certificateEmailSent = await sendCertificateReadyEmail({
    userId: original.user_id,
    certificateId: replacement.id,
    firstName: context.profile.first_name,
    email: context.profile.email,
    certificateNumber: replacement.certificate_number,
    issuedDate: new Intl.DateTimeFormat("de-DE", {
      dateStyle: "long",
      timeZone: "Europe/Berlin",
    }).format(new Date(replacement.issued_at)),
    pdf,
    filename: safeFilename(participantName),
  });
  return { certificate: replacement, certificateEmailSent };
}

export async function reissueVerifiedLegacyCertificate(input: {
  actorId: string;
  reviewId: string;
  participantName?: string;
}): Promise<{ certificate: CertificateClaim; certificateEmailSent: boolean }> {
  const admin = getSupabaseAdmin();
  const { data: review, error: reviewError } = await admin
    .from("legacy_certificate_reviews")
    .select(
      "id,user_id,course_id,reported_status,reported_course_version,review_status,mapped_certificate_id",
    )
    .eq("id", input.reviewId)
    .maybeSingle();
  if (reviewError) {
    throw new HttpError(
      503,
      "Der historische Zertifikatsnachweis kann gerade nicht geladen werden.",
    );
  }
  if (!review)
    throw new HttpError(
      404,
      "Der historische Zertifikatsnachweis wurde nicht gefunden.",
    );
  if (
    review.review_status !== "verified" ||
    review.reported_status !== "valid"
  ) {
    throw new HttpError(
      409,
      "Eine Neuausstellung ist erst nach Prüfung eines als gültig gemeldeten Nachweises möglich.",
    );
  }
  if (review.mapped_certificate_id) {
    throw new HttpError(
      409,
      "Der historische Nachweis ist bereits einem Zertifikat zugeordnet.",
    );
  }
  if (!review.reported_course_version) {
    throw new HttpError(
      409,
      "Für die kontrollierte Neuausstellung fehlt eine nachgewiesene historische Kursversion.",
    );
  }

  const [courseResult, profileResult, replacementResult] = await Promise.all([
    admin.from("courses").select("id").eq("id", review.course_id).single(),
    admin
      .from("profiles")
      .select("first_name,last_name,certificate_name,email")
      .eq("auth_user_id", review.user_id)
      .single(),
    admin
      .from("certificates")
      .select(
        "id,certificate_number,participant_name,file_key,file_sha256,issued_at,status,updated_at,completion_snapshot_id",
      )
      .eq("legacy_review_id", review.id)
      .in("status", ["replacing", "valid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (courseResult.error || profileResult.error || replacementResult.error) {
    throw new HttpError(
      503,
      "Die Neuausstellung kann gerade nicht vorbereitet werden.",
    );
  }
  if (!courseResult.data || !profileResult.data) {
    throw new HttpError(
      409,
      "Kurs oder Profil des historischen Nachweises ist nicht mehr verfügbar.",
    );
  }
  if (replacementResult.data?.status === "valid") {
    return {
      certificate: replacementResult.data as CertificateClaim,
      certificateEmailSent: true,
    };
  }
  if (replacementResult.data?.status === "replacing") {
    const stale =
      Date.now() - new Date(replacementResult.data.updated_at).getTime() >
      15 * 60 * 1000;
    if (!stale)
      throw new HttpError(
        409,
        "Die kontrollierte Neuausstellung wird bereits vorbereitet.",
      );
    const { data: released, error: releaseError } = await admin
      .from("certificates")
      .update({ status: "failed" })
      .eq("id", replacementResult.data.id)
      .eq("status", "replacing")
      .select("id")
      .maybeSingle();
    if (releaseError || !released) {
      throw new HttpError(
        409,
        "Der Neuausstellungsstatus wurde zwischenzeitlich geändert.",
      );
    }
  }

  const profile = profileResult.data;
  const participantName = (
    input.participantName ??
    profile.certificate_name ??
    `${profile.first_name} ${profile.last_name}`
  ).trim();
  if (participantName.length < 2 || participantName.length > 160) {
    throw new HttpError(
      400,
      "Der Zertifikatsname muss zwischen 2 und 160 Zeichen lang sein.",
    );
  }

  let replacement: CertificateClaim | null = null;
  for (let retry = 0; retry < 4 && !replacement; retry += 1) {
    const number = certificateNumber();
    const { data, error } = await admin
      .from("certificates")
      .insert({
        user_id: review.user_id,
        course_id: review.course_id,
        certificate_number: number,
        course_version: review.reported_course_version,
        participant_name: participantName,
        file_key: `${review.user_id}/${review.course_id}/${number}.pdf`,
        file_sha256: "0".repeat(64),
        legacy_review_id: review.id,
        status: "replacing",
      })
      .select(
        "id,certificate_number,participant_name,file_key,file_sha256,issued_at,status,updated_at,completion_snapshot_id",
      )
      .single();
    if (!error && data) replacement = data as CertificateClaim;
    else if (!error || error.code !== "23505") {
      throw new HttpError(
        503,
        "Die kontrollierte Neuausstellung konnte nicht beansprucht werden.",
      );
    }
  }
  if (!replacement) {
    throw new HttpError(
      503,
      "Für die kontrollierte Neuausstellung konnte keine eindeutige Nummer erzeugt werden.",
    );
  }

  let pdf: Uint8Array;
  try {
    const issuedAt = new Date(replacement.issued_at);
    pdf = await buildCertificatePdf({
      participantName,
      certificateNumber: replacement.certificate_number,
      issuedAt,
      courseVersion: review.reported_course_version,
      issuerName: requireEnv("CERTIFICATE_ISSUER_NAME"),
      signatoryName: requireEnv("CERTIFICATE_SIGNATORY_NAME"),
      verificationUrl: certificateVerificationUrl(
        replacement.certificate_number,
      ),
      signaturePath: optionalEnv("CERTIFICATE_SIGNATURE_FILE"),
    });
    const hash = createHash("sha256").update(pdf).digest("hex");
    const { error: uploadError } = await admin.storage
      .from(optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates")
      .upload(replacement.file_key, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError)
      throw new Error("Legacy certificate replacement upload failed.");
    const { data: activatedId, error: activationError } = await admin.rpc(
      "activate_legacy_certificate_reissue",
      {
        editing_admin_id: input.actorId,
        target_review_id: review.id,
        replacement_certificate_id: replacement.id,
        replacement_hash: hash,
        replacement_participant_name: participantName,
      },
    );
    if (activationError || activatedId !== replacement.id) {
      throw new Error("Legacy certificate replacement activation failed.");
    }
    replacement = {
      ...replacement,
      file_sha256: hash,
      participant_name: participantName,
      status: "valid",
    };
  } catch (error) {
    const { error: failureError } = await admin
      .from("certificates")
      .update({ status: "failed" })
      .eq("id", replacement.id)
      .eq("status", "replacing");
    if (failureError) {
      throw new Error(
        "Legacy certificate reissue and failure persistence both failed.",
        { cause: error },
      );
    }
    throw error;
  }

  const certificateEmailSent = await sendCertificateReadyEmail({
    userId: review.user_id,
    certificateId: replacement.id,
    firstName: profile.first_name,
    email: profile.email,
    certificateNumber: replacement.certificate_number,
    issuedDate: new Intl.DateTimeFormat("de-DE", {
      dateStyle: "long",
      timeZone: "Europe/Berlin",
    }).format(new Date(replacement.issued_at)),
    pdf,
    filename: safeFilename(participantName),
  });
  return { certificate: replacement, certificateEmailSent };
}
