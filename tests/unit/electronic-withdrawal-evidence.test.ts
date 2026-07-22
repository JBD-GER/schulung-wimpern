// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("unveränderlicher elektronischer Widerrufsnachweis", () => {
  it("ist append-only, nicht öffentlich lesbar und nur über die enge RPC schreibbar", () => {
    const migration = read(
      "supabase/migrations/202607210011_electronic_withdrawal_function.sql",
    );

    expect(migration).toContain(
      "create table if not exists public.withdrawal_requests",
    );
    expect(migration).toContain(
      "before update or delete on public.withdrawal_requests",
    );
    expect(migration).toContain("Electronic withdrawal evidence is immutable");
    expect(migration).toContain(
      "Electronic withdrawal evidence cannot be deleted",
    );
    expect(migration).toContain(
      "alter table public.withdrawal_requests enable row level security",
    );
    expect(migration).toMatch(
      /revoke all on table public\.withdrawal_requests[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(migration).toContain(
      "grant select on table public.withdrawal_requests to service_role",
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_electronic_withdrawal\(text, text, text, text\)[\s\S]*from public, anon, authenticated;/,
    );
  });

  it("bindet Inhalt, Datenbankzeit und Eingangsnummer an eine SHA-256-Evidenz", () => {
    const migration = read(
      "supabase/migrations/202607210011_electronic_withdrawal_function.sql",
    );

    expect(migration).toContain("received_timestamp := clock_timestamp()");
    expect(migration).toContain(
      "generated_declaration_payload := jsonb_build_object",
    );
    expect(migration).toContain("'consumerName', normalized_name");
    expect(migration).toContain("'contractReference', normalized_reference");
    expect(migration).toContain("'confirmationEmail', normalized_email");
    expect(migration).toContain("'declarationText', fixed_declaration_text");
    expect(migration).toContain(
      "generated_evidence_document := jsonb_build_object",
    );
    expect(migration).toContain(
      "sha256(convert_to(generated_evidence_document::text, 'UTF8'))",
    );
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(
      "submission key was already used for different content",
    );
  });

  it("stellt die gesetzlich eindeutigen Funktionen und den Mailinhalt bereit", () => {
    const form = read("src/components/marketing/withdrawal-form.tsx");
    const footer = read("src/components/site-footer.tsx");
    const email = read("src/lib/server/email.ts");
    const migration = read(
      "supabase/migrations/202607210011_electronic_withdrawal_function.sql",
    );
    const declaration =
      "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Online-Schulung Wimpernverlängerung.";

    expect(footer).toContain('label: "Vertrag widerrufen"');
    expect(form).toContain('"Widerruf bestätigen"');
    expect(form).toContain(declaration);
    expect(migration).toContain(declaration);
    expect(form).toContain("consumerName");
    expect(form).toContain("contractReference");
    expect(form).toContain("confirmationEmail");
    expect(email).toContain("sendWithdrawalReceivedEmail");
    expect(email).toContain("Datum und Uhrzeit des Eingangs");
    expect(email).toContain("Inhalt deiner Erklärung");
    expect(email).toContain("Vertragsidentifikation");
  });
});
