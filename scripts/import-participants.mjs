#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_COLUMNS = [
  "source_id",
  "first_name",
  "last_name",
  "email",
  "purchase_date",
  "payment_status",
  "course_access",
  "completed_lessons",
  "certificate_status",
  "payment_source",
];

const PAYMENT_STATUSES = new Set([
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "refunded",
  "disputed",
]);
const ACCESS_STATUSES = new Set([
  "pending_payment",
  "active",
  "completed",
  "revoked",
  "refunded",
  "disputed",
]);
const CERTIFICATE_STATUSES = new Set(["none", "pending", "valid", "revoked"]);
const PAYMENT_SOURCES = new Set(["stripe", "paypal", "manual", "legacy"]);
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error(`Aufruf:
  # Lokaler Dry Run; mit Supabase-Variablen zusätzlich DB-Preflight
  npm run migrate:participants -- --file ./teilnehmerinnen.csv

  # Separater, wiederholbarer Vorbereitungsschritt für fehlende Konten
  npm run migrate:participants -- --file ./teilnehmerinnen.csv --send-invites

  # Atomarer Import; Einladungen und Business-Import werden nie vermischt
  npm run migrate:participants -- --file ./teilnehmerinnen.csv --apply \\
    --batch-id IMPORT-2026-01 --confirm IMPORT-2026-01

Ohne --apply werden keine Bestellungen, Teilnahmen oder Fortschritte importiert.
--send-invites ist eine ausdrücklich bestätigte, separate Schreiboperation;
Klartextpasswörter werden niemals importiert.`);
  process.exit(message ? 1 : 0);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted)
    throw new Error(
      "Die CSV enthält ein nicht geschlossenes Anführungszeichen.",
    );
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function normalizedDate(value, rowNumber, errors) {
  if (!DATE_ONLY.test(value) && !RFC3339.test(value)) {
    errors.push(
      `Zeile ${rowNumber}: purchase_date muss ISO 8601 mit Zeitzone oder YYYY-MM-DD sein.`,
    );
    return null;
  }
  const normalized = DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    errors.push(
      `Zeile ${rowNumber}: purchase_date ist kein gültiges Kalenderdatum.`,
    );
    return null;
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) {
    errors.push(
      `Zeile ${rowNumber}: purchase_date enthält kein existierendes Kalenderdatum.`,
    );
    return null;
  }
  return date.toISOString();
}

function normalizeRecord(record, rowNumber, errors) {
  const sourceId = record.source_id.trim();
  const email = record.email.trim().toLowerCase();
  const completedLessons = Number(record.completed_lessons);
  const amountMinor = record.amount_minor?.trim()
    ? Number(record.amount_minor)
    : null;
  const currency = record.currency?.trim().toLowerCase() || null;
  const paymentStatus = record.payment_status.trim().toLowerCase();
  const courseAccess = record.course_access.trim().toLowerCase();
  const certificateStatus = record.certificate_status.trim().toLowerCase();
  const paymentSource = record.payment_source.trim().toLowerCase();

  if (!sourceId || sourceId.length > 160)
    errors.push(
      `Zeile ${rowNumber}: source_id muss 1 bis 160 Zeichen lang sein.`,
    );
  if (
    record.first_name.trim().length < 2 ||
    record.first_name.trim().length > 100
  ) {
    errors.push(
      `Zeile ${rowNumber}: first_name muss 2 bis 100 Zeichen lang sein.`,
    );
  }
  if (
    record.last_name.trim().length < 2 ||
    record.last_name.trim().length > 100
  ) {
    errors.push(
      `Zeile ${rowNumber}: last_name muss 2 bis 100 Zeichen lang sein.`,
    );
  }
  if (`${record.first_name.trim()} ${record.last_name.trim()}`.length > 160) {
    errors.push(
      `Zeile ${rowNumber}: der daraus gebildete Zertifikatsname ist länger als 160 Zeichen.`,
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push(`Zeile ${rowNumber}: ungültige E-Mail-Adresse.`);
  if (!PAYMENT_STATUSES.has(paymentStatus))
    errors.push(`Zeile ${rowNumber}: unbekannter payment_status.`);
  if (!ACCESS_STATUSES.has(courseAccess))
    errors.push(`Zeile ${rowNumber}: unbekannter course_access.`);
  if (!CERTIFICATE_STATUSES.has(certificateStatus))
    errors.push(`Zeile ${rowNumber}: unbekannter certificate_status.`);
  if (!PAYMENT_SOURCES.has(paymentSource))
    errors.push(`Zeile ${rowNumber}: unbekannte payment_source.`);
  if (
    !Number.isInteger(completedLessons) ||
    completedLessons < 0 ||
    completedLessons > 7
  ) {
    errors.push(
      `Zeile ${rowNumber}: completed_lessons muss eine ganze Zahl von 0 bis 7 sein.`,
    );
  }
  if (
    amountMinor !== null &&
    (!Number.isInteger(amountMinor) || amountMinor < 0)
  ) {
    errors.push(
      `Zeile ${rowNumber}: amount_minor muss ein nicht negativer Ganzzahlbetrag sein.`,
    );
  }
  if (currency !== null && !/^[a-z]{3}$/.test(currency)) {
    errors.push(
      `Zeile ${rowNumber}: currency muss aus drei Buchstaben bestehen.`,
    );
  }
  if ((amountMinor === null) !== (currency === null)) {
    errors.push(
      `Zeile ${rowNumber}: amount_minor und currency müssen gemeinsam gesetzt oder leer sein.`,
    );
  }

  if (
    ["pending", "processing"].includes(paymentStatus) &&
    courseAccess !== "pending_payment"
  ) {
    errors.push(
      `Zeile ${rowNumber}: eine ausstehende Zahlung darf noch keinen Kurszugang gewähren.`,
    );
  }
  if (
    ["failed", "expired"].includes(paymentStatus) &&
    !["pending_payment", "revoked"].includes(courseAccess)
  ) {
    errors.push(
      `Zeile ${rowNumber}: fehlgeschlagene/abgelaufene Zahlung ist mit course_access unvereinbar.`,
    );
  }
  if (
    paymentStatus === "refunded" &&
    !["refunded", "revoked"].includes(courseAccess)
  ) {
    errors.push(
      `Zeile ${rowNumber}: eine Erstattung erfordert erstatteten oder widerrufenen Zugang.`,
    );
  }
  if (
    paymentStatus === "disputed" &&
    !["disputed", "revoked"].includes(courseAccess)
  ) {
    errors.push(
      `Zeile ${rowNumber}: ein Chargeback erfordert strittigen oder widerrufenen Zugang.`,
    );
  }
  if (
    ["active", "completed"].includes(courseAccess) &&
    paymentStatus !== "paid"
  ) {
    errors.push(
      `Zeile ${rowNumber}: aktiver/abgeschlossener Zugang erfordert payment_status=paid.`,
    );
  }
  if (courseAccess === "completed" && completedLessons !== 7) {
    errors.push(
      `Zeile ${rowNumber}: course_access=completed erfordert completed_lessons=7.`,
    );
  }
  if (completedLessons > 0 && courseAccess === "pending_payment") {
    errors.push(
      `Zeile ${rowNumber}: ausstehender Zugang darf keinen abgeschlossenen Fortschritt enthalten.`,
    );
  }
  if (certificateStatus !== "none" && completedLessons !== 7) {
    errors.push(
      `Zeile ${rowNumber}: ein gemeldeter Zertifikatsstatus erfordert sieben abgeschlossene Lektionen.`,
    );
  }
  if (
    certificateStatus !== "none" &&
    !["completed", "revoked", "refunded", "disputed"].includes(courseAccess)
  ) {
    errors.push(
      `Zeile ${rowNumber}: Zertifikatsstatus und course_access sind widersprüchlich.`,
    );
  }

  return {
    rowNumber,
    sourceId,
    firstName: record.first_name.trim(),
    lastName: record.last_name.trim(),
    email,
    purchaseDate: normalizedDate(
      record.purchase_date.trim(),
      rowNumber,
      errors,
    ),
    paymentStatus,
    courseAccess,
    completedLessons,
    certificateStatus,
    paymentSource,
    amountMinor,
    currency,
  };
}

async function loadRecords(file) {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(file),
    );
  } catch {
    throw new Error("Die CSV ist nicht gültig als UTF-8 codiert.");
  }
  source = source.replace(/^\uFEFF/, "");
  const rows = parseCsv(source);
  if (rows.length < 2) throw new Error("Die CSV enthält keine Datenzeilen.");
  const headers = rows[0].map((header) => header.trim());
  const missing = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  if (missing.length)
    throw new Error(`Pflichtspalten fehlen: ${missing.join(", ")}`);
  if (new Set(headers).size !== headers.length)
    throw new Error("Die CSV enthält doppelte Spaltennamen.");

  const errors = [];
  const records = rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      errors.push(
        `Zeile ${index + 2}: ${values.length} statt ${headers.length} Spalten.`,
      );
    }
    const record = Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""]),
    );
    return normalizeRecord(record, index + 2, errors);
  });
  const seenEmails = new Map();
  const seenSources = new Map();
  for (const record of records) {
    const firstEmailRow = seenEmails.get(record.email);
    if (firstEmailRow)
      errors.push(
        `Zeile ${record.rowNumber}: E-Mail bereits in Zeile ${firstEmailRow} enthalten.`,
      );
    else seenEmails.set(record.email, record.rowNumber);
    const sourceKey = `${record.paymentSource}:${record.sourceId}`;
    const firstSourceRow = seenSources.get(sourceKey);
    if (firstSourceRow)
      errors.push(
        `Zeile ${record.rowNumber}: Quellen-ID bereits in Zeile ${firstSourceRow} enthalten.`,
      );
    else seenSources.set(sourceKey, record.rowNumber);
  }
  if (records.length > 500)
    errors.push("Ein Batch darf höchstens 500 Zeilen enthalten.");
  if (errors.length)
    throw new Error(`Validierung fehlgeschlagen:\n- ${errors.join("\n- ")}`);
  return records;
}

function createAdminClient(required) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    if (required)
      throw new Error(
        "SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind erforderlich.",
      );
    return null;
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rpcRecords(records) {
  return records.map((record) => {
    const stripePriceId =
      record.paymentSource === "stripe"
        ? process.env.STRIPE_PRICE_ID
        : `migration:${record.paymentSource}:${record.sourceId}`;
    if (!stripePriceId)
      throw new Error(
        "STRIPE_PRICE_ID fehlt für einen importierten Stripe-Kauf.",
      );
    return {
      ...record,
      amountMinor:
        record.amountMinor === null ? "" : String(record.amountMinor),
      currency: record.currency ?? "",
      stripePriceId,
    };
  });
}

async function preflight(admin, records) {
  const { data, error } = await admin.rpc(
    "preflight_legacy_participant_batch",
    {
      p_records: rpcRecords(records),
    },
  );
  if (error) throw error;
  return data;
}

function printPreflight(report) {
  console.log(
    `DB-Preflight: ${report.candidates ?? 0} importierbar, ${report.alreadyImported ?? 0} bereits importiert, ${(report.missingAccounts ?? []).length} Konten fehlen.`,
  );
  for (const issue of report.issues ?? []) {
    console.error(
      `- Zeile ${issue.rowNumber} (${issue.email}): ${issue.message} [${issue.code}]`,
    );
  }
}

async function sendInvites(admin, records, report) {
  if ((report.issues ?? []).length > 0) {
    throw new Error(
      "Kontoeinladungen werden erst nach Klärung aller bestehenden Datenkonflikte gesendet.",
    );
  }
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!siteUrl)
    throw new Error(
      "NEXT_PUBLIC_SITE_URL ist für Kontoeinladungen erforderlich.",
    );

  const byEmail = new Map(records.map((record) => [record.email, record]));
  const failures = [];
  let sent = 0;
  for (const missing of report.missingAccounts ?? []) {
    const record = byEmail.get(missing.email);
    if (!record)
      throw new Error(`Interner Zuordnungsfehler für ${missing.email}.`);
    const { error } = await admin.auth.admin.inviteUserByEmail(record.email, {
      data: {
        first_name: record.firstName,
        last_name: record.lastName,
        certificate_name: `${record.firstName} ${record.lastName}`,
        migration_source: "legacy_participant_import",
      },
      redirectTo: `${siteUrl}/api/auth/callback?next=/passwort-zuruecksetzen&flow=invite`,
    });
    if (error) failures.push(`${record.email}: ${error.message}`);
    else sent += 1;
  }
  console.log(
    `Einladungsvorbereitung: ${sent} gesendet, ${failures.length} fehlgeschlagen.`,
  );
  if (failures.length) {
    throw new Error(
      `Nicht alle Einladungen konnten gesendet werden:\n- ${failures.join("\n- ")}\nDer Schritt ist wiederholbar; Business-Daten wurden nicht importiert.`,
    );
  }
}

async function main() {
  if (process.argv.includes("--help")) usage();
  const file = option("--file");
  if (!file) usage("--file fehlt.");
  const applyChanges = process.argv.includes("--apply");
  const prepareInvites = process.argv.includes("--send-invites");
  if (applyChanges && prepareInvites) {
    usage(
      "--apply und --send-invites sind aus Sicherheitsgründen getrennte Schritte.",
    );
  }

  const records = await loadRecords(file);
  console.log(`CSV gültig: ${records.length} eindeutige Teilnehmerinnen.`);

  const admin = createAdminClient(applyChanges || prepareInvites);
  if (!admin) {
    console.log(
      "Lokaler Dry Run abgeschlossen. Es wurden keine Daten verändert und keine E-Mails gesendet.",
    );
    console.log(
      "Für den vollständigen DB-Konfliktbericht SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.",
    );
    return;
  }

  const report = await preflight(admin, records);
  printPreflight(report);

  if (prepareInvites) {
    await sendInvites(admin, records, report);
    console.log(
      "Konten wurden nur vorbereitet. Nach Annahme/Anlage der Konten den Dry Run erneut ausführen; es wurden keine Business-Daten importiert.",
    );
    return;
  }
  if (!applyChanges) {
    console.log(
      "Vollständiger Dry Run abgeschlossen. Es wurden keine Daten verändert und keine E-Mails gesendet.",
    );
    return;
  }

  const batchId = option("--batch-id");
  if (!batchId || option("--confirm") !== batchId) {
    usage(
      "Für --apply müssen --batch-id und --confirm explizit gesetzt und exakt gleich sein.",
    );
  }
  if (!report.ready) {
    throw new Error(
      "Der atomare Import wurde wegen fehlender Konten oder Datenkonflikte vollständig abgebrochen.",
    );
  }

  const { data, error } = await admin.rpc("import_legacy_participant_batch", {
    p_batch_id: batchId,
    p_records: rpcRecords(records),
  });
  if (error) throw error;
  console.log(`Atomarer Import abgeschlossen: ${JSON.stringify(data)}.`);
  if ((data.certificateReviews ?? 0) > 0) {
    console.log(
      "Historische Abschlüsse wurden nur als legacy_completed übernommen; Video- und Quiznachweise wurden nicht erfunden. Gemeldete Zertifikate liegen bis zur Evidenzprüfung in der Admin-Warteschlange.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
