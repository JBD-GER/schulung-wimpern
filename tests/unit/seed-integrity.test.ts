// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

describe("Kurs- und Quiz-Seed", () => {
  it("enthält sieben Lektionen und exakt 35 Fragen mit je vier Optionen", () => {
    expect(
      seed.match(/\(\d, '[^']+', (?:null::text|'[^']*'), '[^']+'/g),
    ).toHaveLength(7);
    expect(seed.match(/"question":/g)).toHaveLength(35);
    expect(seed.match(/"options":/g)).toHaveLength(35);
    expect(seed.match(/"correct":/g)).toHaveLength(35);

    const optionBlocks = [
      ...seed.matchAll(/"options": \[(.*?)\],\s*"correct":/gs),
    ];
    expect(optionBlocks).toHaveLength(35);
    for (const block of optionBlocks) {
      expect(block[1].match(/^\s*"/gm)).toHaveLength(4);
    }
  });

  it("veröffentlicht ungeprüfte Quizfragen nicht automatisch", () => {
    expect(seed).toContain("'draft'");
    expect(seed).toContain("approved_by = null");
    expect(seed).toContain("approved_at = null");
    expect(seed).not.toMatch(/set\s+status\s*=\s*'approved'/i);
  });

  it("hält Kurs und Lektionen bis zu Videos und Quizfreigabe im Entwurf", () => {
    expect(seed).toMatch(/'Anfänger',\s*'2026\.1',\s*'draft',\s*420/);
    expect(seed).toMatch(/lesson\.duration_seconds,\s*0\.900,\s*'draft'/);
    expect(seed.match(/status\s*=\s*excluded\.status/g)).toHaveLength(2);
  });
});
