// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), "supabase/migrations", file),
    "utf8",
  );
}

function sqlFunction(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} fehlt`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} ist nicht abgeschlossen`).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

describe("Teilnehmerinnenmigration", () => {
  it("führt die Importvorlage standardmäßig als schreibgeschützten Dry Run aus", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/import-participants.mjs"),
        "--file",
        resolve(process.cwd(), "supabase/participants-import.template.csv"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("CSV gültig: 1 eindeutige Teilnehmerinnen");
    expect(result.stdout).toContain("Es wurden keine Daten verändert");
  });

  it("weist beschädigtes UTF-8 ab, statt Namen mit Ersatzzeichen zu importieren", () => {
    const directory = mkdtempSync(join(tmpdir(), "swv-import-test-"));
    const file = join(directory, "broken.csv");
    try {
      writeFileSync(file, Buffer.from([0xff, 0xfe, 0x00, 0x61]));
      const result = spawnSync(
        process.execPath,
        [
          resolve(process.cwd(), "scripts/import-participants.mjs"),
          "--file",
          file,
        ],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("nicht gültig als UTF-8 codiert");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("verwendet eine atomare DB-RPC und globale Quellen-Idempotenz", () => {
    const script = resolve(process.cwd(), "scripts/import-participants.mjs");
    const result = spawnSync(process.execPath, [script, "--help"], {
      encoding: "utf8",
    });
    expect(result.stderr).toContain("Atomarer Import");

    const migration = resolve(
      process.cwd(),
      "supabase/migrations/202607210002_legacy_import.sql",
    );
    const source = readFileSync(migration, "utf8");
    expect(source).toContain("primary key (payment_source, source_id)");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("preflight_legacy_participant_batch");
  });

  it("übernimmt historischen Fortschritt ausdrücklich ohne Video- oder Quiznachweis", () => {
    const initial = migrationSource("202607210001_initial.sql");
    const importMigration = migrationSource("202607210002_legacy_import.sql");
    const upgrade = migrationSource(
      "202607210003_legacy_completion_review.sql",
    );
    const importFunction = sqlFunction(
      importMigration,
      "import_legacy_participant_batch",
    );

    expect(initial).toContain(
      "legacy_completed boolean not null default false",
    );
    expect(importMigration).toContain(
      "reported_completed_lessons smallint not null",
    );
    expect(importFunction).toContain(
      "video_completed, quiz_passed, legacy_completed, completed_at",
    );
    expect(importFunction).toMatch(/false,\s*false,\s*true,\s*null/);
    expect(importFunction).not.toContain("insert into public.quiz_attempts");
    expect(upgrade).toContain("set legacy_completed = true");
    expect(upgrade).toContain(
      "on conflict (payment_source, source_id) do nothing",
    );
  });

  it("zählt Legacy-Abschlüsse zur Navigation, aber nie zur automatischen Zertifikatsberechtigung", () => {
    const initial = migrationSource("202607210001_initial.sql");
    const upgrade = migrationSource(
      "202607210003_legacy_completion_review.sql",
    );
    const initialUnlock = sqlFunction(initial, "lesson_is_unlocked");
    const upgradedUnlock = sqlFunction(upgrade, "lesson_is_unlocked");
    const eligibility = sqlFunction(
      initial,
      "certificate_evidence_eligibility",
    );

    expect(initialUnlock).toContain("progress.legacy_completed");
    expect(upgradedUnlock).toContain("progress.legacy_completed");
    expect(eligibility).not.toContain("legacy_completed");
    expect(eligibility).toContain("from public.quiz_attempts attempt");
    expect(eligibility).toContain("attempt.passed = true");
    expect(eligibility).toContain("attempt.score >= 4");
  });

  it("legt gemeldete Zertifikate in eine service-only Prüfwarteschlange mit auditierten Aktionen", () => {
    const importMigration = migrationSource("202607210002_legacy_import.sql");
    const upgrade = migrationSource(
      "202607210003_legacy_completion_review.sql",
    );

    for (const source of [importMigration, upgrade]) {
      expect(source).toContain("legacy_certificate_reviews");
      expect(source).toContain("review_legacy_certificate_reference");
      expect(source).toContain("map_legacy_certificate_reference");
      expect(source).toContain("activate_legacy_certificate_reissue");
      expect(source).toContain(
        "revoke execute on function public.review_legacy_certificate_reference",
      );
      expect(source).toContain("to service_role");
      expect(source).not.toContain("insert into public.quiz_attempts");
    }
  });

  it("erfindet für Legacy-Rückzahlungen keine Ereigniszeit", () => {
    const importMigration = migrationSource("202607210002_legacy_import.sql");
    const completionUpgrade = migrationSource(
      "202607210003_legacy_completion_review.sql",
    );
    const evidenceUpgrade = migrationSource(
      "202607210004_payment_evidence_hardening.sql",
    );
    for (const source of [importMigration, completionUpgrade]) {
      const importer = sqlFunction(source, "import_legacy_participant_batch");
      expect(importer).toMatch(/paid_at, refunded_at[\s\S]*\n\s*null,/);
      expect(importer).toMatch(/granted_at, revoked_at[\s\S]*\n\s*null,/);
    }
    expect(evidenceUpgrade).toContain("legacy_refund_timestamp_cleared");
    expect(evidenceUpgrade).toContain("legacy_revocation_timestamp_cleared");
  });

  it("verlangt die belegte Legacy-Kursversion nur für eine Bestätigung", () => {
    for (const file of [
      "202607210002_legacy_import.sql",
      "202607210003_legacy_completion_review.sql",
      "202607210004_payment_evidence_hardening.sql",
    ]) {
      const review = sqlFunction(
        migrationSource(file),
        "review_legacy_certificate_reference",
      );
      expect(review, file).toContain("review_decision = 'verified'");
      expect(review, file).toContain("reported_course_version = case");
      expect(review, file).toMatch(/else null\s+end/);
    }
  });

  it("bricht das Payment-Hardening bei nicht abgeglichenen alten Stripe-Objekten ab", () => {
    const upgrade = migrationSource(
      "202607210004_payment_evidence_hardening.sql",
    );

    expect(upgrade).toContain("STRIPE_HARDENING_PREFLIGHT_REQUIRED");
    expect(upgrade).toContain("public.legacy_import_records");
    expect(upgrade).toContain("legacy_record.order_id = stripe_order.id");
    expect(upgrade).toContain("billing_snapshot ->> 'billingFingerprint'");
    expect(upgrade).toContain("stripe_order.course_id is null");
  });

  it("fenced das Checkout-Profilupdate atomar mit dem gültigen Customer-Lease", () => {
    for (const file of [
      "202607210001_initial.sql",
      "202607210004_payment_evidence_hardening.sql",
    ]) {
      const updateProfile = sqlFunction(
        migrationSource(file),
        "update_checkout_profile_under_lease",
      );
      expect(updateProfile, file).toContain("pg_advisory_xact_lock");
      expect(updateProfile, file).toContain(
        "lease.lease_token = checkout_lease_token",
      );
      expect(updateProfile, file).toContain(
        "lease.expires_at > timezone('utc', now())",
      );
      expect(updateProfile, file).toContain("update public.profiles");
    }
  });

  it("bindet bestehende native Zertifikate auditiert, aber keine Legacy-Prüffälle", () => {
    const upgrade = migrationSource(
      "202607210004_payment_evidence_hardening.sql",
    );
    expect(upgrade).toContain("'kind', 'pre_hardening_certificate'");
    expect(upgrade).toContain("'pre_hardening_certificate_snapshot_created'");
    expect(upgrade).toMatch(
      /where certificate\.legacy_review_id is null[\s\S]*certificate\.completion_snapshot_id is null/,
    );
    expect(upgrade).toMatch(
      /set completion_snapshot_id = snapshot\.id[\s\S]*certificate\.legacy_review_id is null/,
    );
    const backfill = upgrade.slice(
      upgrade.indexOf("with certificate_evidence as"),
      upgrade.indexOf("alter table public.legacy_certificate_reviews"),
    );
    expect(backfill).not.toContain("legacy_review_id is not null");
  });

  it("serialisiert jede Rate-Limit-Entscheidung vor Zählen und Einfügen", () => {
    const migrations = [
      migrationSource("202607210001_initial.sql"),
      migrationSource("202607210003_legacy_completion_review.sql"),
    ];

    for (const migration of migrations) {
      const limiter = sqlFunction(migration, "consume_rate_limit");
      const lock = limiter.indexOf("pg_advisory_xact_lock");
      const count = limiter.indexOf("select count(*) into current_count");
      const insert = limiter.indexOf("insert into public.rate_limit_events");
      expect(lock).toBeGreaterThan(-1);
      expect(lock).toBeLessThan(count);
      expect(count).toBeLessThan(insert);
      expect(limiter).toContain(
        "jsonb_build_array(event_bucket, event_subject_hash)::text",
      );
      expect(limiter).toContain("maximum_events is null");
      expect(limiter).toContain("window_seconds is null");
    }
  });
});
