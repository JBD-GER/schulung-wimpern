// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607210011_electronic_withdrawal_function.sql",
  ),
  "utf8",
);

describe("reparierende Widerrufsmigration 011", () => {
  it("akzeptiert die bereits atomar angelegte Evidenztabelle", () => {
    expect(migration).toMatch(
      /create table if not exists public\.withdrawal_requests/i,
    );
  });

  it("legt den vorhandenen Index nicht doppelt an", () => {
    expect(migration).toMatch(
      /create index if not exists withdrawal_requests_email_received_idx/i,
    );
  });

  it("ersetzt den Unveränderlichkeitstrigger kontrolliert", () => {
    const drop = migration.search(
      /drop trigger if exists withdrawal_requests_freeze\s+on public\.withdrawal_requests/i,
    );
    const create = migration.search(
      /create trigger withdrawal_requests_freeze\b/i,
    );

    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
  });

  it("bestätigt erst nach dem Commit sichtbar den Erfolg", () => {
    expect(migration).toMatch(/\nbegin;\s/i);
    expect(migration).toMatch(
      /\ncommit;\s+select 'OK: Migration 202607210011 wurde vollständig angewendet\.'\s+as migration_status;\s*$/i,
    );
  });

  it("löscht bei der Reparatur weder Evidenz noch Schema", () => {
    expect(migration).not.toMatch(
      /\bdelete\s+from\s+public\.withdrawal_requests\b/i,
    );
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+column\b/i);
  });
});
