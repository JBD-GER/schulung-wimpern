import { createHash } from "node:crypto";

import { sendWithdrawalReceivedEmail } from "@/lib/server/email";
import {
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { electronicWithdrawalSchema } from "@/lib/validation/withdrawal";

interface RecordedWithdrawal {
  withdrawal_id: string;
  receipt_number: string;
  received_at: string;
  recorded_consumer_name: string;
  recorded_contract_reference: string;
  recorded_confirmation_email: string;
  declaration_text: string;
}

function firstRecordedWithdrawal(value: unknown): RecordedWithdrawal | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Partial<RecordedWithdrawal>;
  return typeof candidate.withdrawal_id === "string" &&
    typeof candidate.receipt_number === "string" &&
    typeof candidate.received_at === "string" &&
    typeof candidate.recorded_consumer_name === "string" &&
    typeof candidate.recorded_contract_reference === "string" &&
    typeof candidate.recorded_confirmation_email === "string" &&
    typeof candidate.declaration_text === "string"
    ? (candidate as RecordedWithdrawal)
    : null;
}

async function sendImmediateReceipt(
  recorded: RecordedWithdrawal,
): Promise<boolean> {
  const message = {
    withdrawalId: recorded.withdrawal_id,
    receiptNumber: recorded.receipt_number,
    consumerName: recorded.recorded_consumer_name,
    contractReference: recorded.recorded_contract_reference,
    confirmationEmail: recorded.recorded_confirmation_email,
    declarationText: recorded.declaration_text,
    receivedAt: recorded.received_at,
  };

  try {
    if (await sendWithdrawalReceivedEmail(message)) return true;
    // The delivery claim is idempotent and permits a failed delivery to be
    // retried immediately with the same provider idempotency key.
    return await sendWithdrawalReceivedEmail(message);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = electronicWithdrawalSchema.parse(await readJson(request));

    await enforceRateLimit({
      bucket: "electronic-withdrawal-ip",
      subject: requestSubject(request),
      maximum: 20,
      windowSeconds: 3600,
    });
    await enforceRateLimit({
      bucket: "electronic-withdrawal-email",
      subject: input.confirmationEmail,
      maximum: 5,
      windowSeconds: 3600,
    });

    const submissionKeyHash = createHash("sha256")
      .update(input.submissionId, "utf8")
      .digest("hex");
    const { data, error } = await getSupabaseAdmin().rpc(
      "record_electronic_withdrawal",
      {
        submitted_submission_key_hash: submissionKeyHash,
        submitted_consumer_name: input.consumerName,
        submitted_contract_reference: input.contractReference,
        submitted_confirmation_email: input.confirmationEmail,
      },
    );
    const recorded = firstRecordedWithdrawal(data);
    if (error || !recorded) {
      throw error ?? new Error("Electronic withdrawal receipt was not stored.");
    }

    const emailSent = await sendImmediateReceipt(recorded);
    if (!emailSent) {
      return Response.json(
        {
          ok: false,
          recorded: true,
          emailSent: false,
          error: "withdrawal_confirmation_email_pending",
          message:
            "Dein Widerruf ist eingegangen. Die E-Mail-Bestätigung konnte gerade nicht zugestellt werden. Bitte versuche den Versand erneut.",
          receiptNumber: recorded.receipt_number,
          receivedAt: recorded.received_at,
        },
        { status: 503, headers: noStoreHeaders() },
      );
    }

    return Response.json(
      {
        ok: true,
        recorded: true,
        emailSent: true,
        message:
          "Dein Widerruf ist eingegangen. Wir haben dir die Eingangsbestätigung per E-Mail gesendet.",
        receiptNumber: recorded.receipt_number,
        receivedAt: recorded.received_at,
      },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
