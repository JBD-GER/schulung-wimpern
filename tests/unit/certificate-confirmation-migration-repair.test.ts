// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607210007_certificate_confirmation.sql",
  ),
  "utf8",
);

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe("reparierende Zertifikatsbestaetigungs-Migration 007", () => {
  it("rollt jede unvollständige Reparatur vollständig zurück", () => {
    expect(migration).toMatch(/\nbegin;\s/i);
    expect(migration).toMatch(/\ncommit;\s/i);
    expect(migration).toMatch(
      /select 'OK: Migration 202607210007 wurde vollständig angewendet\.'\s+as migration_status;\s*$/i,
    );
  });

  it("kann nach bereits angelegten Spalten und Tabellen erneut gestartet werden", () => {
    expect(migration).toMatch(
      /alter table public\.profiles\s+add column if not exists certificate_identity_version uuid/i,
    );
    expect(migration).toMatch(
      /alter table public\.certificates\s+add column if not exists issuance_confirmation_id uuid/i,
    );
    expect(migration).toMatch(
      /create table if not exists public\.certificate_issuance_confirmations/i,
    );
  });

  it("akzeptiert vorhandene Objekte nicht ungeprueft", () => {
    expect(migration).toMatch(
      /information_schema\.columns|pg_catalog\.pg_attribute/i,
    );
    expect(migration).toContain("pg_constraint");
    expect(migration).toMatch(/pg_get_constraintdef|contype|confrelid/i);
    expect(migration).toMatch(/raise exception/i);

    for (const constraint of [
      "profiles_certificate_identity_version_key",
      "certificates_issuance_confirmation_id_key",
      "certificates_issuance_confirmation_identity_fkey",
    ]) {
      expect(
        occurrences(migration, constraint),
        `${constraint} muss Teil des kanonisch validierten Vertrags sein`,
      ).toBeGreaterThanOrEqual(1);
    }

    expect(migration).toContain("expected_constraint.conname");
    expect(migration).toContain("actual_definition");
  });

  it("ersetzt jeden Trigger idempotent, statt an seinem vorhandenen Namen zu scheitern", () => {
    for (const [trigger, table] of [
      [
        "certificate_issuance_confirmations_freeze",
        "certificate_issuance_confirmations",
      ],
      ["profiles_rotate_certificate_identity_version", "profiles"],
      ["certificates_validate_confirmation_link", "certificates"],
    ] as const) {
      const drop = migration.search(
        new RegExp(
          `drop\\s+trigger\\s+if\\s+exists\\s+${trigger}\\s+on\\s+public\\.${table}`,
          "i",
        ),
      );
      const create = migration.search(
        new RegExp(`create\\s+trigger\\s+${trigger}\\b`, "i"),
      );

      expect(drop, `${trigger} wird vorab entfernt`).toBeGreaterThanOrEqual(0);
      expect(create, `${trigger} wird wieder angelegt`).toBeGreaterThan(drop);
    }
  });

  it("wiederholt den historischen Backfill ohne Duplikate oder Ueberschreiben", () => {
    const start = migration.indexOf(
      "-- Certificates that were already finalized",
    );
    const end = migration.indexOf(
      "create or replace function public.freeze_certificate_issuance_confirmation",
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const backfill = migration.slice(start, end);
    expect(backfill).toContain("on conflict do nothing");
    expect(backfill).toMatch(
      /update public\.certificates certificate[\s\S]*set issuance_confirmation_id = confirmation\.id/i,
    );
    expect(backfill).toMatch(
      /certificate\.issuance_confirmation_id\s+is\s+null/i,
    );
  });

  it("validiert Zertifikatsnachweise auch bei NULL-Werten fail-closed", () => {
    const start = migration.indexOf(
      "create or replace function public.validate_certificate_confirmation_link",
    );
    const end = migration.indexOf(
      "create trigger certificates_validate_confirmation_link",
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const validator = migration.slice(start, end);
    for (const column of [
      "user_id",
      "course_id",
      "course_version",
      "completion_snapshot_id",
      "participant_name",
    ]) {
      expect(validator).toMatch(
        new RegExp(
          `confirmation\\.${column}\\s+is\\s+distinct\\s+from\\s+new\\.${column}`,
          "i",
        ),
      );
    }
  });

  it("enthaelt keine datenloeschenden Reparaturbefehle", () => {
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+column\b/i);
  });
});
