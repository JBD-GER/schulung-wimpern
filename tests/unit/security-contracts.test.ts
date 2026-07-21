// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

function sqlFunction(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} fehlt`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} ist nicht abgeschlossen`).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

describe("serverseitige Sicherheitsverträge", () => {
  it("liefert vor der Quizabgabe keine Lösungsschlüssel an den Browser", () => {
    const startRoute = read("src/app/api/quiz/[lessonId]/start/route.ts");
    expect(startRoute).toMatch(
      /options:\s*shuffledOptions\.map\(\(option\)\s*=>\s*\(\{\s*id:\s*option\.id,\s*text:\s*option\.option_text,?\s*\}\)\s*\)/s,
    );
    const browserResponse = startRoute.slice(
      startRoute.lastIndexOf("return Response.json("),
    );
    expect(browserResponse).not.toMatch(
      /answerKey|answer_key|isCorrect|is_correct/,
    );
  });

  it("bindet Video-Tokens an Authentifizierung, Enrollment und Freischaltung", () => {
    const tokenRoute = read("src/app/api/video-token/route.ts");
    expect(tokenRoute).toContain("requireUser()");
    expect(tokenRoute).toContain(
      "requireEnrollment(user.id, lesson.course_id)",
    );
    expect(tokenRoute).toContain("assertLessonUnlocked(user.id, lesson.id)");
    expect(tokenRoute).toMatch(/Vary:\s*["']Cookie["']/);
    expect(tokenRoute).not.toMatch(/\.mp4(?:\?|['"])/);
  });

  it("aktiviert keinen Kurs über Return- oder Statusroute", () => {
    for (const file of [
      "src/app/api/checkout/session/route.ts",
      "src/app/api/checkout/status/route.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /from\(['"]enrollments['"]\)\s*\.update\([^)]*active/s,
      );
      expect(source, file).not.toContain("fulfill_stripe_order");
    }
    expect(read("src/lib/server/stripe-webhook.ts")).toContain(
      "fulfill_stripe_order",
    );
  });

  it("nutzt Checkout Sessions im Elements-Modus und einen Stripe-Preis", () => {
    const route = read("src/app/api/checkout/session/route.ts");
    expect(route).toMatch(/ui_mode:\s*["']elements["']/);
    expect(route).toMatch(/mode:\s*["']payment["']/);
    expect(route).toContain("price: product.priceId");
    expect(route).toMatch(/invoice_creation:\s*{\s*enabled:\s*true/);
    expect(route).not.toContain("payment_method_types:");
  });

  it("schützt sensible Tabellen mit RLS und entzieht Lösungstabellen dem Client", () => {
    const migration = read("supabase/migrations/202607210001_initial.sql");
    for (const table of [
      "profiles",
      "orders",
      "enrollments",
      "lesson_progress",
      "quiz_questions",
      "quiz_options",
      "quiz_attempts",
      "quiz_responses",
      "certificates",
      "webhook_events",
      "audit_logs",
      "consent_records",
    ]) {
      expect(migration, table).toContain(
        `alter table public.${table} enable row level security;`,
      );
    }
    expect(migration).toMatch(
      /revoke all on table public\.quiz_questions, public\.quiz_options, public\.quiz_question_versions, public\.quiz_responses from anon, authenticated;/,
    );
    expect(migration).not.toContain("grant select on public.lessons to anon");
  });

  it("hält Abschluss-Snapshots für Browser unveränderlich und service-only", () => {
    for (const file of [
      "supabase/migrations/202607210001_initial.sql",
      "supabase/migrations/202607210004_payment_evidence_hardening.sql",
    ]) {
      const migration = read(file);
      expect(migration, file).toContain(
        "alter table public.course_completion_snapshots enable row level security;",
      );
      expect(migration, file).toMatch(
        /revoke all on table[\s\S]*public\.course_completion_snapshots[\s\S]*from public, anon, authenticated;/,
      );
      expect(migration, file).toMatch(
        /revoke execute on function public\.record_course_completion_snapshot\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated;/,
      );
    }
  });

  it("bindet die Ausstellung an einen unveränderlichen Abschluss-Snapshot", () => {
    const certificate = read("src/lib/server/certificate.ts");
    const migration = read("supabase/migrations/202607210001_initial.sql");
    expect(certificate).toContain(
      "completion_snapshot_id: completionSnapshotId",
    );
    expect(migration).toContain(
      "foreign key (completion_snapshot_id, user_id, course_id, course_version)",
    );
  });

  it("friert finalisierte Zertifikatsinhalte ein und entfernt die normale Neuausstellung", () => {
    const route = read(
      "src/app/api/admin/certificates/[certificateId]/route.ts",
    );
    const manager = read("src/components/admin/certificate-manager.tsx");
    const migration = read(
      "supabase/migrations/202607210006_certificate_immutability.sql",
    );
    const legacyRoute = read(
      "src/app/api/admin/certificate-reviews/[reviewId]/route.ts",
    );

    expect(route).toContain('action: z.literal("revoke")');
    expect(route).not.toContain("reissueCertificate");
    expect(manager).not.toContain("Neu ausstellen");
    expect(manager).toContain(
      "Zertifikatsinhalte bleiben nach der Ausstellung unveränderlich.",
    );
    expect(migration).toContain(
      "create or replace function public.freeze_finalized_certificate_content()",
    );
    expect(migration).toContain(
      "before insert or update or delete on public.certificates",
    );
    expect(migration).toContain("new.participant_name");
    expect(migration).toContain("new.file_sha256");
    expect(migration).toContain("new.completion_snapshot_id");
    expect(migration).toContain("new.status not in ('valid', 'revoked')");
    expect(migration).toContain("new.replaces_certificate_id is not null");
    expect(legacyRoute).toContain('action: z.literal("reissue")');
  });

  it("serialisiert Customer-Erstellung und hält Session-Rotationen persistent gesperrt", () => {
    for (const file of [
      "supabase/migrations/202607210001_initial.sql",
      "supabase/migrations/202607210004_payment_evidence_hardening.sql",
    ]) {
      const migration = read(file);
      const claim = sqlFunction(migration, "claim_checkout_order");
      const acquire = sqlFunction(migration, "acquire_checkout_customer_lease");
      expect(migration, file).toContain("superseded_checkout_session_id text");
      expect(claim).toContain("billingFingerprint");
      expect(claim).toContain("superseded_checkout_session_id");
      expect(claim).toContain("rotated_checkout_session_id text");
      expect(acquire).toContain("pg_advisory_xact_lock");
      expect(acquire).toContain("lease_ttl_seconds not between 30 and 300");
      expect(migration, file).toContain("confirm_checkout_session_rotation");
    }
  });

  it("vereinigt parallelen Wiedergabefortschritt und bindet ihn an die Kursversion", () => {
    for (const file of [
      "supabase/migrations/202607210001_initial.sql",
      "supabase/migrations/202607210004_payment_evidence_hardening.sql",
    ]) {
      const progress = sqlFunction(read(file), "record_video_progress");
      expect(progress, file).toContain("existing_ranges || normalized_ranges");
      expect(progress, file).toContain("for update");
      expect(progress, file).toContain("current_course_version");
      expect(progress, file).toContain("merged_watched_seconds");
    }
  });

  it("speichert erlaubte Sprünge monoton als höchsten Abspielpunkt", () => {
    const file = "supabase/migrations/202607210005_playhead_progress.sql";
    const migration = read(file);
    const progress = sqlFunction(migration, "record_video_progress");

    expect(migration).toContain(
      "drop function if exists public.record_video_progress(uuid, uuid, uuid, jsonb, integer, numeric)",
    );
    expect(progress).toContain(
      "locked_session.course_version is distinct from current_course_version",
    );
    expect(progress).toContain("pg_advisory_xact_lock");
    expect(progress).toContain("greatest(");
    expect(progress).toContain("ceil(reported_position)::integer");
    expect(progress).not.toContain("elapsed server time");
    expect(migration).toContain(
      "revoke all on function public.record_video_progress(uuid, uuid, uuid, numeric)",
    );
  });

  it("rehabilitiert verspätete Zahlungen, verkettet Refunds und wahrt manuelle Sperren", () => {
    for (const file of [
      "supabase/migrations/202607210001_initial.sql",
      "supabase/migrations/202607210004_payment_evidence_hardening.sql",
    ]) {
      const migration = read(file);
      const fulfill = sqlFunction(migration, "fulfill_stripe_order");
      const reversal = sqlFunction(migration, "bind_and_revoke_stripe_order");
      expect(fulfill, file).not.toMatch(
        /target_order\.payment_status in \('failed', 'expired'\)/,
      );
      expect(fulfill, file).toContain(
        "target_order.course_id is distinct from paid_course_id",
      );
      expect(fulfill, file).toContain(
        "competing_order.payment_status = 'paid'",
      );
      expect(fulfill, file).toMatch(
        /target_enrollment\.status not in \(\s*'pending_payment', 'active', 'completed', 'refunded', 'disputed'\s*\)/,
      );
      expect(fulfill, file).not.toMatch(
        /target_enrollment\.status not in \([^)]*'revoked'/,
      );
      expect(reversal, file).toContain("alternate_paid_order");
      expect(reversal, file).toMatch(
        /target_enrollment\.order_id = target_order\.id\s+and target_enrollment\.status <> 'revoked'/,
      );
      expect(reversal, file).toContain("order_id = alternate_paid_order.id");
      expect(reversal, file).toContain(
        "target_order.course_id is distinct from expected_course_id",
      );
    }
  });

  it("sperrt den Verkauf bis Quiz, Videos, Content und Recht freigegeben sind", () => {
    const catalog = read("src/lib/server/catalog.ts");
    const release = read("src/lib/server/release.ts");
    const migration = read("supabase/migrations/202607210001_initial.sql");
    expect(catalog).toContain("getReleaseContract().readyForSale");
    expect(release).toContain("CONTENT_RELEASE_APPROVED");
    expect(release).toContain("LEGAL_TEXTS_APPROVED");
    expect(release).toContain("CHECKOUT_CONSENT_VERSION");
    expect(release).toContain("CHECKOUT_LEGAL_TEXT_HASH");
    expect(catalog).toContain("assert_course_quiz_publishable");
    expect(migration).toMatch(/count\(\*\)\s*=\s*7/);
    expect(migration).toMatch(
      /nullif\(trim\(stream_video_uid\), ''\) is not null/,
    );
    expect(migration).toMatch(/count\(\*\)\s*=\s*35/);
  });

  it("begrenzt Checkout-Statusabfragen server- und clientseitig", () => {
    const statusRoute = read("src/app/api/checkout/status/route.ts");
    const statusClient = read("src/components/checkout/payment-status.tsx");
    expect(statusRoute).toContain('bucket: "checkout-status"');
    expect(statusRoute).toContain("enforceRateLimit");
    expect(statusClient).toContain("MAX_POLLING_MILLISECONDS");
    expect(statusClient).toContain("MAX_POLL_ATTEMPTS");
    expect(statusClient).toContain("REQUEST_TIMEOUT_MILLISECONDS");
    expect(statusClient).toContain("new AbortController()");
    expect(statusClient).toContain(
      "deadlineTimer = setTimeout(markDelayed, MAX_POLLING_MILLISECONDS)",
    );
    expect(statusClient).toContain('setStatus("delayed")');
  });

  it("prüft Zertifikatsinitialen gegen den unveränderlichen PDF-Namen", () => {
    const verificationRoute = read("src/app/api/certificates/verify/route.ts");
    expect(verificationRoute).toContain("participant_name");
    expect(verificationRoute).toContain(
      "initials(certificate.participant_name)",
    );
    expect(verificationRoute).not.toContain("profile.certificate_name");
  });

  it("reauthentifiziert Änderungen der künftigen Zertifikatsidentität", () => {
    const accountRoute = read("src/app/api/account/update/route.ts");
    expect(accountRoute).toContain("certificateIdentityChanged");
    expect(accountRoute).toContain("input.currentPassword");
    expect(accountRoute).toContain("signInWithPassword");
    expect(accountRoute).toContain(
      'bucket: "certificate-name-reauthentication"',
    );
    expect(accountRoute).toContain('field !== "currentPassword"');
    expect(accountRoute).toMatch(
      /company_name:[\s\S]*input\.billingType === "private"[\s\S]*\? null/,
    );
  });

  it("vertraut für anonyme Limits keinen frei gesetzten XFF-Werten", () => {
    const rateLimit = read("src/lib/server/rate-limit.ts");
    const clientIp = read("src/lib/client-ip.ts");
    expect(rateLimit).toContain("trustedClientIp(request)");
    expect(rateLimit).not.toContain('get("x-forwarded-for")');
    expect(clientIp).toContain("TRUSTED_CLIENT_IP_SOURCE");
    expect(clientIp).toContain('vercel: "x-vercel-forwarded-for"');
    expect(clientIp).toContain('cloudflare: "cf-connecting-ip"');
  });
});
