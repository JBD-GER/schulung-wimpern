// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");
const paymentMigration = () =>
  read("supabase/migrations/202607210010_payment_first_checkout.sql");
const identityMigration = () =>
  read("supabase/migrations/202607220001_checkout_password_identity.sql");

function sqlFunction(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} fehlt`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} ist nicht abgeschlossen`).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

describe("Payment-first-Checkout", () => {
  it("wendet die Checkout-Migrationen vollständig atomar an", () => {
    for (const migration of [paymentMigration(), identityMigration()]) {
      expect(migration).toMatch(/\nbegin;\s/i);
      expect(migration).toMatch(/\ncommit;\s/i);
    }
  });

  it("erzeugt vor Paid-Evidenz weder Auth-User noch Order oder Enrollment", () => {
    const createIntent = read("src/app/api/checkout/intent/route.ts");
    const session = read("src/app/api/checkout/intent/session/route.ts");
    const provisioning = read("src/lib/server/checkout-intent.ts");
    const migration = paymentMigration();
    const finalize = sqlFunction(migration, "finalize_paid_checkout_intent");

    expect(createIntent).toContain('.from("checkout_intents")');
    expect(createIntent).not.toMatch(/auth\.signUp|admin\.createUser/);
    expect(session).not.toMatch(/auth\.signUp|admin\.createUser/);
    expect(session).not.toContain('.from("orders").insert');
    expect(session).not.toContain('.from("enrollments").insert');
    expect(provisioning.indexOf("record_paid_checkout_intent")).toBe(-1);
    expect(provisioning).toContain("claim_checkout_intent_provisioning");
    expect(provisioning).toContain("admin.auth.admin.createUser");
    expect(provisioning).toContain("password_hash");
    expect(createIntent).toContain("hashCheckoutPassword");
    expect(createIntent).toContain("identity_mode: user");
    expect(createIntent).not.toContain("sendCheckoutVerificationEmail");
    expect(finalize).toContain("insert into public.orders");
    expect(finalize).toContain("insert into public.enrollments");
    expect(finalize).toContain("target.paid_at is null");
    expect(finalize).toContain(
      "contract_confirmation_text = submitted_contract_confirmation_text",
    );
    expect(finalize).toContain("sha256(convert_to");
    expect(finalize).toContain("insert into public.email_deliveries");
    expect(finalize).toContain(
      "'enrollment-activated:' || created_order.id::text",
    );
    expect(
      finalize.indexOf("insert into public.email_deliveries"),
    ).toBeLessThan(finalize.indexOf("return query select created_order.id"));
  });

  it("legt den historischen Signup- und Session-POST fail-closed still", () => {
    const signup = read("src/app/api/auth/signup/route.ts");
    const legacySession = read("src/app/api/checkout/session/route.ts");
    const accountValidation = read("src/lib/validation/account.ts");

    expect(signup).toContain('error: "signup_disabled"');
    expect(signup).toContain("status: 410");
    expect(signup).not.toMatch(/auth\.signUp|createUser/);
    expect(accountValidation).not.toContain("signupSchema");
    expect(legacySession).toContain('error: "legacy_checkout_disabled"');
    expect(legacySession).toContain("status: 410");
  });

  it("bindet je E-Mail und Kurs höchstens eine zahlbare Session", () => {
    const migration = paymentMigration();
    const hardenedMigration = identityMigration();
    const acquire = sqlFunction(
      hardenedMigration,
      "acquire_checkout_intent_preparation",
    );
    const release = sqlFunction(
      hardenedMigration,
      "release_checkout_intent_preparation",
    );
    const session = read("src/app/api/checkout/intent/session/route.ts");

    expect(migration).toMatch(
      /create unique index if not exists checkout_intents_one_payment_per_email_course[\s\S]*where status in \('processing', 'open', 'paid', 'provisioning'\)/,
    );
    expect(acquire).toContain("set status = 'processing'");
    expect(acquire).toContain("intent.identity_authorized_at is not null");
    expect(release).toContain("else 'ready'");
    expect(session).toContain('"checkout_session_immutable"');
    expect(session).toContain("intent.consent_snapshot?.legalTextHash");
    expect(session).not.toContain("newsletterConsent");
    expect(session).toContain('.eq("status", "processing")');
    expect(session).toContain("legacy_checkout_in_progress");
  });

  it("hält Paid-Provisionierung und Invoice-Bindung unter Datenbank-Locks idempotent", () => {
    const migration = paymentMigration();
    const hardenedMigration = identityMigration();
    const recordPaid = sqlFunction(
      hardenedMigration,
      "record_paid_checkout_intent",
    );
    const finalize = sqlFunction(migration, "finalize_paid_checkout_intent");
    const bindInvoice = sqlFunction(
      migration,
      "bind_paid_checkout_intent_invoice",
    );
    const webhook = read("src/lib/server/stripe-webhook.ts");
    const duplicatePaidBranch = recordPaid.slice(
      recordPaid.indexOf("if target.paid_at is not null then"),
      recordPaid.indexOf(
        "end if;",
        recordPaid.indexOf("if target.paid_at is not null then"),
      ) + "end if;".length,
    );

    expect(recordPaid).toContain("if target.paid_at is not null then");
    expect(duplicatePaidBranch).not.toContain("status = 'paid'");
    expect(duplicatePaidBranch).not.toContain(
      "provisioning_lease_token = null",
    );
    expect(finalize).toContain(
      "hashtextextended(provisioned_user_id::text || ':' || target.course_id::text, 0)",
    );
    expect(finalize).toContain("current_enrollment.status = 'pending_payment'");
    expect(bindInvoice).toContain("for update");
    expect(bindInvoice).toContain("target.provisioned_order_id");
    expect(webhook).toContain('"bind_paid_checkout_intent_invoice"');
    expect(webhook).not.toContain(
      "customer.metadata?.checkout_intent_id !== intent.id",
    );
    expect(webhook).toContain("invoiceMatchesBillingSnapshot");
  });

  it("quittiert den Auth-Bootstrap zweiphasig und cookie-gebunden", () => {
    const complete = read("src/app/api/checkout/intent/complete/route.ts");
    const migration = identityMigration();
    const baseMigration = paymentMigration();

    expect(complete).toContain('"claim_checkout_intent_bootstrap"');
    expect(complete).toContain('"consume_checkout_intent_bootstrap"');
    expect(complete).toContain("expected_browser_token_hash");
    expect(complete).toContain("if (!observedSessionId)");
    expect(complete).toContain('"checkout_bootstrap_expired"');
    expect(complete).toMatch(
      /verifyOtp\([\s\S]*status: "pending"[\s\S]*consume_checkout_intent_bootstrap/,
    );
    expect(baseMigration).toContain("bootstrap_lease_expires_at timestamptz");
    expect(migration).toContain(
      "and intent.expires_at > timezone('utc', now())",
    );
    expect(migration).toContain("browser_token_hash = encode(");
    expect(migration).toContain(
      "create or replace function public.consume_checkout_intent_bootstrap(",
    );
  });

  it("verwendet nur den eindeutig beschrifteten eigenen Zahlungsbutton", () => {
    const checkout = read("src/components/checkout/checkout-flow.tsx");

    expect(checkout).toContain("Zahlungspflichtig bestellen");
    expect(checkout).toContain('fetch("/api/checkout/intent/session"');
    expect(checkout).toContain('fetch("/api/checkout/intent/cancel"');
    expect(checkout).toContain("session.expiresAt * 1000");
    expect(checkout).not.toContain("ExpressCheckoutElement");
    expect(checkout).not.toContain("PasswordStrength");
    expect(checkout).toContain('register("passwordConfirmation")');
    expect(checkout).toContain('register("password")');
    expect(checkout).toContain("Weiter zu den Rechnungsdaten");
    expect(checkout).not.toContain("Bestätige deine E-Mail-Adresse");
    expect(read("src/app/api/checkout/intent/session/route.ts")).toContain(
      'payment_method_types: ["card"]',
    );
    expect(read("src/app/checkout/page.tsx")).toContain(
      'paymentState === "expired"',
    );
  });

  it("löscht nur lange abgelaufene unbezahlte Intents", () => {
    const migration = identityMigration();
    const purge = sqlFunction(
      migration,
      "purge_expired_unpaid_checkout_intents",
    );

    expect(purge).toContain("paid_at is null");
    expect(purge).toContain("provisioned_order_id is null");
    expect(purge).toContain(
      "stripe_customer_id is null or auth_user_id is not null",
    );
    expect(purge).toContain("interval '30 days'");
    expect(migration).toContain(
      "revoke execute on function public.purge_expired_unpaid_checkout_intents() from public, anon, authenticated;",
    );
    const webhook = read("src/lib/server/stripe-webhook.ts");
    const terminalHandler = webhook.slice(
      webhook.indexOf("async function markCheckoutFailed"),
      webhook.indexOf("async function reconcilePaidCheckoutIntentInvoice"),
    );
    expect(terminalHandler).not.toContain("customers.del");
  });

  it("bindet ohne Mail-Link niemals allein anhand einer bestehenden E-Mail", () => {
    const createIntent = read("src/app/api/checkout/intent/route.ts");
    const session = read("src/app/api/checkout/intent/session/route.ts");
    const provisioning = read("src/lib/server/checkout-intent.ts");
    const complete = read("src/app/api/checkout/intent/complete/route.ts");
    const migration = identityMigration();
    const bind = sqlFunction(migration, "bind_checkout_intent_auth_user");
    const guard = sqlFunction(migration, "protect_checkout_password_identity");

    expect(createIntent).toContain('"checkout_login_required"');
    expect(createIntent).toContain("resolveAuthUserByEmail(input.email)");
    expect(session).toContain(
      'intent.identity_mode === "new_account_password"',
    );
    expect(session).toContain("resolveAuthUserByEmail(intent.email)");
    expect(session).toContain(
      "Für diese E-Mail-Adresse besteht inzwischen ein Konto",
    );
    expect(provisioning).toContain(
      '"checkout_identity_collision_after_payment"',
    );
    expect(provisioning).toContain(
      "data.user.app_metadata?.checkout_intent_id !== intent.id",
    );
    expect(bind).toContain(
      "auth_user.raw_app_meta_data ->> 'checkout_intent_id' = target.id::text",
    );
    expect(guard).toContain("new.signup_password_hash := null");
    expect(guard).toContain("new.password_set_at := timezone('utc', now())");
    expect(complete).toContain(
      'intent.identity_mode === "existing_authenticated"',
    );
    expect(complete).toContain('"checkout_bootstrap_identity_mismatch"');
  });

  it("holt abgestürzte Mail-Claims zurück und unterstützt belegte Doppelbestellungen", () => {
    const cron = read("src/app/api/cron/email-retries/route.ts");

    expect(cron).toContain("provisionPaidCheckoutIntent");
    expect(cron).toContain("status.eq.paid");
    expect(cron).toContain("status.eq.provisioning");
    expect(cron).toContain("provisioning_lease_expires_at.lt.");
    expect(cron).toContain("status.eq.sending");
    expect(cron).toContain("updated_at.lt.");
    expect(cron).toContain('.eq("course_id", order.course_id)');
    expect(cron).toContain("intent.provisioned_order_id !== order.id");
    expect(cron).not.toContain('.eq("order_id", order.id)');
  });

  it("verwendet für provisionierte Käufe immer die unveränderten gespeicherten Bytes", () => {
    const provisioning = read("src/lib/server/checkout-intent.ts");
    const frozenBranch = provisioning.slice(
      provisioning.indexOf("// A provisioned purchase must always use"),
      provisioning.indexOf('if (intent.status === "provisioned")'),
    );

    expect(frozenBranch).toContain("intent.contract_confirmation_text");
    expect(frozenBranch).toContain('createHash("sha256")');
    expect(frozenBranch).not.toContain("readCheckoutContractSnapshot");
    expect(frozenBranch).not.toContain("buildContractConfirmationText");
  });
});
