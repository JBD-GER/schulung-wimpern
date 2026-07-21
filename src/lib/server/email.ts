import "server-only";

import { createHash } from "node:crypto";

import { Resend } from "resend";

import { getSiteUrl, optionalEnv, requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });

function emailShell(preheader: string, content: string): string {
  const support = escapeHtml(optionalEnv("SUPPORT_EMAIL") ?? "Support");
  const logoUrl = escapeHtml(`${getSiteUrl()}/brand/brand-email-selected.png`);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#FBF9F6;color:#20242A;font-family:Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #E8DED2;border-radius:14px;overflow:hidden">
<tr><td style="padding:20px 32px;background:#1D2733;color:#fff;font-family:Georgia,serif;font-size:22px"><img src="${logoUrl}" width="42" height="42" alt="Schulung Wimpernverlängerung" style="display:inline-block;width:42px;height:42px;margin-right:12px;vertical-align:middle"><span style="vertical-align:middle">Schulung Wimpernverlängerung</span></td></tr>
<tr><td style="padding:32px;line-height:1.65">${content}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #E8DED2;color:#667085;font-size:13px">Fragen? Antworte auf diese E-Mail oder schreibe an ${support}.<br><a href="${getSiteUrl()}/impressum">Impressum</a> · <a href="${getSiteUrl()}/datenschutz">Datenschutz</a></td></tr>
</table></td></tr></table></body></html>`;
}

function button(label: string, url: string): string {
  return `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1D2733;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

interface TransactionalEmail {
  userId?: string;
  to: string;
  template: string;
  eventKey: string;
  subject: string;
  html: string;
  text: string;
  attachment?: { filename: string; content: Uint8Array; contentType: string };
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: claim, error: claimError } = await admin.rpc(
    "claim_email_delivery",
    {
      delivery_user_id: email.userId ?? null,
      delivery_recipient: email.to,
      delivery_template: email.template,
      delivery_event_key: email.eventKey,
    },
  );
  if (claimError) return false;
  const claimed = Array.isArray(claim) ? claim[0] : claim;
  if (!claimed?.claimed) return claimed?.delivery_status === "sent";
  const deliveryId = claimed.delivery_id as string;

  try {
    const resend = new Resend(requireEnv("EMAIL_PROVIDER_API_KEY"));
    const result = await resend.emails.send(
      {
        from: requireEnv("EMAIL_FROM"),
        replyTo: optionalEnv("SUPPORT_EMAIL"),
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments:
          email.attachment &&
          email.attachment.content.byteLength <= 10 * 1024 * 1024
            ? [
                {
                  filename: email.attachment.filename,
                  content: Buffer.from(email.attachment.content),
                  contentType: email.attachment.contentType,
                },
              ]
            : undefined,
      },
      { idempotencyKey: email.eventKey.slice(0, 256) },
    );
    if (result.error || !result.data)
      throw new Error("E-Mail-Provider hat den Versand abgelehnt.");
    const { error: sentPersistError } = await admin
      .from("email_deliveries")
      .update({
        status: "sent",
        provider_message_id: result.data.id,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", deliveryId);
    if (sentPersistError)
      throw new Error("E-Mail-Erfolg konnte nicht gespeichert werden.");
    return true;
  } catch {
    const { error: failedPersistError } = await admin
      .from("email_deliveries")
      .update({
        status: "failed",
        error_message:
          "Versand fehlgeschlagen; sicherer Wiederholungsversuch möglich.",
      })
      .eq("id", deliveryId);
    if (failedPersistError) return false;
    return false;
  }
}

export async function sendWithdrawalReceivedEmail(input: {
  withdrawalId: string;
  receiptNumber: string;
  consumerName: string;
  contractReference: string;
  confirmationEmail: string;
  declarationText: string;
  receivedAt: string;
}) {
  const receivedAt = new Date(input.receivedAt);
  if (Number.isNaN(receivedAt.getTime())) {
    throw new Error(
      "Ungültiger Eingangszeitpunkt für die Widerrufsbestätigung.",
    );
  }

  const localTimestamp = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  }).format(receivedAt);
  const utcTimestamp = receivedAt.toISOString();

  return sendTransactionalEmail({
    to: input.confirmationEmail,
    template: "electronic_withdrawal_received",
    eventKey: `electronic-withdrawal-received:${input.withdrawalId}`,
    subject: "Eingangsbestätigung deines Widerrufs",
    html: emailShell(
      `Dein Widerruf ist am ${localTimestamp} eingegangen.`,
      `<p>Hallo ${escapeHtml(input.consumerName)},</p><p>wir bestätigen den Eingang deiner elektronischen Widerrufserklärung.</p><p><strong>Eingangsnummer:</strong><br>${escapeHtml(input.receiptNumber)}</p><p><strong>Datum und Uhrzeit des Eingangs:</strong><br>${escapeHtml(localTimestamp)}<br><span style="color:#667085;font-size:13px">UTC: ${escapeHtml(utcTimestamp)}</span></p><p><strong>Name:</strong><br>${escapeHtml(input.consumerName)}</p><p><strong>Vertragsidentifikation:</strong><br>${escapeHtml(input.contractReference)}</p><p><strong>Kommunikationsmittel für diese Bestätigung:</strong><br>E-Mail an ${escapeHtml(input.confirmationEmail)}</p><p><strong>Inhalt deiner Erklärung:</strong></p><blockquote style="margin:12px 0;padding:14px 18px;border-left:3px solid #B89054;background:#FBF9F6">${escapeHtml(input.declarationText)}</blockquote><p>Diese Nachricht bestätigt den Eingang deiner Erklärung. Die weitere Bearbeitung und die gesetzlichen Folgen werden gesondert geprüft.</p>`,
    ),
    text: `Hallo ${input.consumerName},\n\nwir bestätigen den Eingang deiner elektronischen Widerrufserklärung.\n\nEingangsnummer: ${input.receiptNumber}\nDatum und Uhrzeit des Eingangs: ${localTimestamp}\nUTC: ${utcTimestamp}\n\nName: ${input.consumerName}\nVertragsidentifikation: ${input.contractReference}\nKommunikationsmittel für diese Bestätigung: E-Mail an ${input.confirmationEmail}\n\nInhalt deiner Erklärung:\n${input.declarationText}\n\nDiese Nachricht bestätigt den Eingang deiner Erklärung. Die weitere Bearbeitung und die gesetzlichen Folgen werden gesondert geprüft.`,
  });
}

export async function sendEnrollmentActivatedEmail(input: {
  userId: string;
  orderId: string;
  firstName: string;
  email: string;
  passwordCreatedDuringCheckout?: boolean;
  contractConfirmation?: {
    productName: string;
    amountTotal: number;
    currency: string;
    taxAmount: number | null;
    paidAt: string;
    text: string;
    sha256: string;
  };
}) {
  const dashboard = `${getSiteUrl()}/dashboard`;
  const greeting = escapeHtml(input.firstName);
  const contractText = input.contractConfirmation?.text ?? null;
  if (
    contractText &&
    createHash("sha256").update(contractText, "utf8").digest("hex") !==
      input.contractConfirmation?.sha256
  ) {
    throw new Error(
      "Die Vertragsbestätigung hat die Integritätsprüfung nicht bestanden.",
    );
  }
  const total = input.contractConfirmation
    ? new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: input.contractConfirmation.currency.toUpperCase(),
      }).format(input.contractConfirmation.amountTotal / 100)
    : null;
  return sendTransactionalEmail({
    userId: input.userId,
    to: input.email,
    template: "enrollment_activated",
    eventKey: `enrollment-activated:${input.orderId}`,
    subject: "Dein Schulungsplatz ist aktiviert",
    html: emailShell(
      "Dein Zugang zur Online-Schulung Wimpernverlängerung ist jetzt freigeschaltet.",
      `<p>Hallo ${greeting},</p><p>vielen Dank für deine Buchung. Deine Zahlung wurde erfolgreich bestätigt und dein persönlicher Schulungsplatz ist ab sofort freigeschaltet.</p>${input.contractConfirmation ? `<p><strong>Bestellung:</strong> ${escapeHtml(input.orderId)}<br><strong>Leistung:</strong> ${escapeHtml(input.contractConfirmation.productName)}<br><strong>Gesamtpreis:</strong> ${escapeHtml(total!)}</p><p>Deine vollständige, bei Vertragsschluss festgeschriebene Vertragsbestätigung mit der angenommenen AGB- und Widerrufsfassung sowie deiner Erklärung zum vorzeitigen Beginn ist dieser E-Mail als Textdatei beigefügt. Bitte bewahre sie auf.</p>` : ""}<p>Du kannst dich jetzt in deinem Teilnehmerbereich anmelden und direkt mit der ersten Lektion beginnen.</p><p>Deine Schulung umfasst sieben Lektionen mit geschützten Lernvideos, Wissenstests und deinem persönlichen Abschlusszertifikat nach erfolgreichem Bestehen.</p><p><strong>Deine Zugangsdaten:</strong><br>E-Mail: ${escapeHtml(input.email)}</p><p>${input.passwordCreatedDuringCheckout === false ? "Im Zahlungsbrowser wirst du automatisch angemeldet. Lege für spätere Anmeldungen über „Passwort vergessen“ ein persönliches Passwort fest." : "Bitte verwende das Passwort, das du bei der Buchung festgelegt hast."}</p>${button("Schulung jetzt starten", dashboard)}<p>Deine Rechnung wird über Stripe bereitgestellt und ist zusätzlich in deinem Profil unter „Bestellungen & Rechnungen“ verfügbar.</p>`,
    ),
    text: `Hallo ${input.firstName},\n\nvielen Dank für deine Buchung. Deine Zahlung wurde erfolgreich bestätigt und dein persönlicher Schulungsplatz ist ab sofort freigeschaltet.${input.contractConfirmation ? `\n\nBestellung: ${input.orderId}\nLeistung: ${input.contractConfirmation.productName}\nGesamtpreis: ${total}\n\nDeine vollständige, bei Vertragsschluss festgeschriebene Vertragsbestätigung mit der angenommenen AGB- und Widerrufsfassung sowie deiner Erklärung zum vorzeitigen Beginn ist als Textdatei beigefügt. Bitte bewahre sie auf.` : ""}\n\nDu kannst dich jetzt in deinem Teilnehmerbereich anmelden und direkt mit der ersten Lektion beginnen.\n\nDeine Schulung umfasst sieben Lektionen mit geschützten Lernvideos, Wissenstests und deinem persönlichen Abschlusszertifikat nach erfolgreichem Bestehen.\n\nDeine Zugangsdaten:\nE-Mail: ${input.email}\n\n${input.passwordCreatedDuringCheckout === false ? "Im Zahlungsbrowser wirst du automatisch angemeldet. Lege für spätere Anmeldungen über „Passwort vergessen“ ein persönliches Passwort fest." : "Bitte verwende das Passwort, das du bei der Buchung festgelegt hast."}\n\nSchulung jetzt starten: ${dashboard}\n\nDeine Rechnung wird über Stripe bereitgestellt und ist zusätzlich in deinem Profil unter „Bestellungen & Rechnungen“ verfügbar.`,
    attachment: contractText
      ? {
          filename: `Vertragsbestaetigung-${input.orderId}.txt`,
          content: new TextEncoder().encode(contractText),
          contentType: "text/plain; charset=utf-8",
        }
      : undefined,
  });
}

export async function sendCheckoutVerificationEmail(input: {
  intentId: string;
  firstName: string;
  email: string;
  token: string;
}) {
  const verificationUrl = new URL("/api/checkout/intent/verify", getSiteUrl());
  verificationUrl.searchParams.set("token", input.token);
  return sendTransactionalEmail({
    to: input.email,
    template: "checkout_email_verification",
    eventKey: `checkout-email-verification:${input.intentId}`,
    subject: "E-Mail-Adresse für deine Buchung bestätigen",
    html: emailShell(
      "Bestätige deine E-Mail-Adresse, bevor du zur sicheren Zahlung weitergehst.",
      `<p>Hallo ${escapeHtml(input.firstName)},</p><p>du möchtest einen Schulungsplatz buchen. Bestätige bitte jetzt deine E-Mail-Adresse im selben Browser, in dem du den Checkout geöffnet hast.</p>${button("E-Mail-Adresse bestätigen", verificationUrl.toString())}<p>Erst nach dieser Bestätigung kann die Zahlung geöffnet werden. Dein Teilnehmerkonto, deine Bestellung und dein Kurszugang entstehen trotzdem erst nach einer von Stripe bestätigten erfolgreichen Zahlung.</p><p>Wenn du diese Buchung nicht begonnen hast, ignoriere diese E-Mail.</p>`,
    ),
    text: `Hallo ${input.firstName},\n\nbestätige deine E-Mail-Adresse im selben Browser, in dem du den Checkout geöffnet hast:\n${verificationUrl.toString()}\n\nDein Teilnehmerkonto, deine Bestellung und dein Kurszugang entstehen erst nach einer von Stripe bestätigten erfolgreichen Zahlung. Wenn du diese Buchung nicht begonnen hast, ignoriere diese E-Mail.`,
  });
}

export async function sendCourseCompletedEmail(input: {
  userId: string;
  courseId: string;
  firstName: string;
  email: string;
}) {
  const certificate = `${getSiteUrl()}/zertifikat`;
  return sendTransactionalEmail({
    userId: input.userId,
    to: input.email,
    template: "course_completed",
    eventKey: `course-completed:${input.userId}:${input.courseId}`,
    subject: "Glückwunsch – du hast deine Schulung erfolgreich abgeschlossen!",
    html: emailShell(
      "Alle sieben Lektionen und Wissenstests sind geschafft.",
      `<p>Hallo ${escapeHtml(input.firstName)},</p><p>herzlichen Glückwunsch! Du hast alle sieben Lektionen der Online-Schulung Wimpernverlängerung erfolgreich abgeschlossen und sämtliche Wissenstests bestanden.</p><p>Damit hast du den vollständigen theoretischen und praktischen Lernbereich der Schulung bearbeitet. Dein Kurszugang bleibt erhalten und du kannst alle Inhalte weiterhin ansehen.</p><p>Bevor dein persönliches Abschlusszertifikat einmalig erstellt wird, musst du den darauf gedruckten Vor- und Nachnamen verbindlich prüfen und bestätigen.</p>${button("Zertifikatsdaten jetzt prüfen", certificate)}<p>Nach der Ausstellung ist der Zertifikatsinhalt unveränderlich. Eine spätere Korrektur ist nicht automatisch möglich, sondern erfordert eine separate Supportprüfung; ein solcher Prozess kann kostenpflichtig sein.</p>`,
    ),
    text: `Hallo ${input.firstName},\n\nherzlichen Glückwunsch! Du hast alle sieben Lektionen der Online-Schulung Wimpernverlängerung erfolgreich abgeschlossen und sämtliche Wissenstests bestanden.\n\nDamit hast du den vollständigen theoretischen und praktischen Lernbereich der Schulung bearbeitet. Dein Kurszugang bleibt erhalten und du kannst alle Inhalte weiterhin ansehen.\n\nBevor dein persönliches Abschlusszertifikat einmalig erstellt wird, musst du den darauf gedruckten Vor- und Nachnamen verbindlich prüfen und bestätigen.\n\nZertifikatsdaten jetzt prüfen: ${certificate}\n\nNach der Ausstellung ist der Zertifikatsinhalt unveränderlich. Eine spätere Korrektur ist nicht automatisch möglich, sondern erfordert eine separate Supportprüfung; ein solcher Prozess kann kostenpflichtig sein.`,
  });
}

export async function sendCertificateReadyEmail(input: {
  userId: string;
  certificateId: string;
  firstName: string;
  email: string;
  certificateNumber: string;
  issuedDate: string;
  pdf: Uint8Array;
  filename: string;
}) {
  const download = `${getSiteUrl()}/zertifikat`;
  const attachable = input.pdf.byteLength <= 10 * 1024 * 1024;
  return sendTransactionalEmail({
    userId: input.userId,
    to: input.email,
    template: "certificate_ready",
    eventKey: `certificate-ready:${input.certificateId}`,
    subject: "Dein Zertifikat steht zum Download bereit",
    html: emailShell(
      "Dein persönliches Abschlusszertifikat ist fertig.",
      `<p>Hallo ${escapeHtml(input.firstName)},</p><p>dein persönliches Abschlusszertifikat für die Online-Schulung „Professionelle 1:1 Wimpernverlängerung“ wurde erfolgreich erstellt.</p><p>Du findest dein Zertifikat:</p><ul><li>${attachable ? "als PDF im Anhang dieser E-Mail" : "als PDF über den sicheren Download, da es für einen E-Mail-Anhang zu groß ist"}</li><li>über den sicheren Download-Button</li><li>dauerhaft in deinem Teilnehmerbereich unter „Zertifikat“</li></ul><p><strong>Zertifikatsnummer:</strong><br>${escapeHtml(input.certificateNumber)}</p><p><strong>Ausstellungsdatum:</strong><br>${escapeHtml(input.issuedDate)}</p>${button("Zertifikat herunterladen", download)}`,
    ),
    text: `Hallo ${input.firstName},\n\ndein persönliches Abschlusszertifikat für die Online-Schulung „Professionelle 1:1 Wimpernverlängerung“ wurde erfolgreich erstellt.\n\nDu findest dein Zertifikat:\n- ${attachable ? "als PDF im Anhang dieser E-Mail" : "als PDF über den sicheren Download, da es für einen E-Mail-Anhang zu groß ist"}\n- über den sicheren Download-Button\n- dauerhaft in deinem Teilnehmerbereich unter „Zertifikat“\n\nZertifikatsnummer:\n${input.certificateNumber}\n\nAusstellungsdatum:\n${input.issuedDate}\n\nZertifikat herunterladen: ${download}`,
    attachment: attachable
      ? {
          filename: input.filename,
          content: input.pdf,
          contentType: "application/pdf",
        }
      : undefined,
  });
}
