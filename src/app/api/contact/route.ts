import { optionalEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/server/email";
import {
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contactSchema } from "@/lib/validation/contact";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const raw = await readJson(request);
    if (
      typeof raw === "object" &&
      raw !== null &&
      typeof (raw as { website?: unknown }).website === "string" &&
      (raw as { website: string }).website.length > 0
    ) {
      return Response.json(
        { ok: true, message: "Danke. Deine Nachricht wurde übermittelt." },
        { headers: noStoreHeaders() },
      );
    }
    const input = contactSchema.parse(raw);
    await enforceRateLimit({
      bucket: "contact",
      subject: `${requestSubject(request)}:${input.email}`,
      maximum: 5,
      windowSeconds: 3600,
    });
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("contact_messages")
      .insert({
        name: input.name,
        email: input.email,
        topic: input.topic,
        message: input.message,
      })
      .select("id")
      .single();
    if (error || !data)
      throw error ?? new Error("Contact message insert failed");
    const supportEmail = optionalEnv("SUPPORT_EMAIL");
    if (supportEmail) {
      await sendTransactionalEmail({
        to: supportEmail,
        template: "contact_message",
        eventKey: `contact:${data.id}`,
        subject: `Kontaktanfrage: ${input.topic}`,
        html: `<p><strong>Name:</strong> ${escapeHtml(input.name)}</p><p><strong>E-Mail:</strong> ${escapeHtml(input.email)}</p><p><strong>Thema:</strong> ${escapeHtml(input.topic)}</p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
        text: `Name: ${input.name}\nE-Mail: ${input.email}\nThema: ${input.topic}\n\n${input.message}`,
      });
    }
    return Response.json(
      { ok: true, message: "Danke. Deine Nachricht wurde übermittelt." },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
