// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607210010_payment_first_checkout.sql",
  ),
  "utf8",
);

describe("reparierende Payment-first-Migration 010", () => {
  it("überspringt die bereits atomar angelegte Basistabelle", () => {
    expect(migration).toMatch(
      /create table if not exists public\.checkout_intents/i,
    );
  });

  it("legt bereits vorhandene Indizes nicht doppelt an", () => {
    for (const index of [
      "checkout_intents_expiry_idx",
      "checkout_intents_email_idx",
      "checkout_intents_provisioning_idx",
      "checkout_intents_one_payment_per_email_course",
    ]) {
      expect(migration).toMatch(
        new RegExp(`create(?: unique)? index if not exists ${index}\\b`, "i"),
      );
    }
  });

  it("ersetzt vorhandene Trigger kontrolliert", () => {
    for (const trigger of [
      "checkout_intents_updated_at",
      "checkout_intents_contract_confirmation_freeze",
    ]) {
      const drop = migration.search(
        new RegExp(
          `drop trigger if exists ${trigger}\\s+on public\\.checkout_intents`,
          "i",
        ),
      );
      const create = migration.search(
        new RegExp(`create trigger ${trigger}\\b`, "i"),
      );

      expect(drop).toBeGreaterThanOrEqual(0);
      expect(create).toBeGreaterThan(drop);
    }
  });

  it("bestätigt erst nach dem Commit sichtbar den Erfolg", () => {
    expect(migration).toMatch(/\nbegin;\s/i);
    expect(migration).toMatch(
      /\ncommit;\s+select 'OK: Migration 202607210010 wurde vollständig angewendet\.'\s+as migration_status;\s*$/i,
    );
  });

  it("enthält keine destruktive Schema-Reparatur", () => {
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+column\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });
});
