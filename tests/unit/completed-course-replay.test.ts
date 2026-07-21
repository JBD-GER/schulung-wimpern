// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enrollmentHasDurableCompletion } from "@/lib/server/access";

describe("dauerhafter Kurs-Replay nach Abschluss", () => {
  it("stützt den Sequenz-Bypass auf den dauerhaften Abschluss-Snapshot", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/202607210008_completed_course_replay.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("public.course_completion_snapshots snapshot");
    expect(migration).toContain("snapshot.user_id = check_user_id");
    expect(migration).toContain("snapshot.course_id = target.course_id");
    expect(migration).toContain("enrollment.status in ('active', 'completed')");
    expect(migration).toContain("previous.position < target.position");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("erkennt den Abschluss auch bei einem reaktivierten aktiven Enrollment", () => {
    expect(
      enrollmentHasDurableCompletion({
        completed_course_version: "2026.1",
      }),
    ).toBe(true);
    expect(
      enrollmentHasDurableCompletion({ completed_course_version: null }),
    ).toBe(false);
  });

  it("verwendet die dauerhafte Evidenz konsistent für Dashboard und Lektionsseite", () => {
    const queries = readFileSync(
      resolve(process.cwd(), "src/lib/server/queries.ts"),
      "utf8",
    );

    expect(queries).toContain(
      '.select("id,course_id,status,granted_at,completed_course_version")',
    );
    expect(
      queries.match(/enrollmentHasDurableCompletion\(enrollment\)/g),
    ).toHaveLength(3);
    expect(queries).not.toContain(
      'const courseCompleted = enrollment.status === "completed"',
    );
  });

  it("sperrt neue Quizabgaben atomar unter dem Enrollment-Lock, lässt gespeicherte Retries aber vorher zurückkehren", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/202607210008_completed_course_replay.sql",
      ),
      "utf8",
    );
    const retry = migration.indexOf(
      "if locked_attempt.submitted_at is not null then",
    );
    const attemptLock = migration.indexOf("select * into locked_attempt");
    const courseResolution = migration.indexOf(
      "select lesson.course_id, course.version",
    );
    const courseLock = migration.indexOf(
      "hashtextextended(submitting_user_id::text || ':' || attempt_course_id::text, 0)",
    );
    const enrollmentLock = migration.indexOf("select * into locked_enrollment");
    const durableFreeze = migration.indexOf(
      "locked_enrollment.completed_course_version is not null",
    );
    const responseInsert = migration.indexOf(
      "insert into public.quiz_responses",
    );

    expect(migration).toContain("locked_enrollment public.enrollments%rowtype");
    expect(attemptLock).toBeGreaterThan(-1);
    expect(courseResolution).toBeGreaterThan(attemptLock);
    expect(courseLock).toBeGreaterThan(courseResolution);
    expect(enrollmentLock).toBeGreaterThan(courseLock);
    expect(migration).toMatch(
      /from public\.enrollments enrollment[\s\S]*for update;/,
    );
    expect(migration).toContain("public.course_completion_snapshots snapshot");
    expect(retry).toBeGreaterThan(-1);
    expect(retry).toBeLessThan(durableFreeze);
    expect(durableFreeze).toBeLessThan(responseInsert);
    expect(migration).toContain("Course completion is immutable");
  });

  it("nimmt den gemeinsamen User-Kurs-Lock in allen Abschluss- und Zahlungspfaden vor dem Enrollment-Lock", () => {
    const paymentMigration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/202607210004_payment_evidence_hardening.sql",
      ),
      "utf8",
    );
    const functionNames = [
      "record_course_completion_snapshot",
      "fulfill_stripe_order",
      "bind_and_revoke_stripe_order",
      "claim_checkout_order",
    ];

    for (const functionName of functionNames) {
      const start = paymentMigration.indexOf(
        `create or replace function public.${functionName}(`,
      );
      const nextFunction = paymentMigration.indexOf(
        "\ncreate or replace function public.",
        start + 1,
      );
      const functionSql = paymentMigration.slice(
        start,
        nextFunction === -1 ? undefined : nextFunction,
      );
      const advisoryLock = functionSql.indexOf("pg_advisory_xact_lock");
      const enrollmentTouch = functionSql.search(
        /(?:from|update) public\.enrollments/,
      );

      expect(start, functionName).toBeGreaterThan(-1);
      expect(advisoryLock, functionName).toBeGreaterThan(-1);
      expect(enrollmentTouch, functionName).toBeGreaterThan(advisoryLock);
    }
  });
});
