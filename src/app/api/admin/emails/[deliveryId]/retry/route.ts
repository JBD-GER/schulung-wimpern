import { createHash } from "node:crypto";

import { optionalEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/server/auth";
import {
  contractConfirmationForIntent,
  type CheckoutIntentRow,
} from "@/lib/server/checkout-intent";
import {
  sendCertificateReadyEmail,
  sendCourseCompletedEmail,
  sendEnrollmentActivatedEmail,
  sendTransactionalEmail,
  sendWithdrawalReceivedEmail,
} from "@/lib/server/email";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );

export async function POST(
  request: Request,
  context: { params: Promise<{ deliveryId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { deliveryId } = await context.params;
    const admin = getSupabaseAdmin();
    const { data: delivery, error: deliveryError } = await admin
      .from("email_deliveries")
      .select("id,user_id,recipient_email,template,event_key,status")
      .eq("id", deliveryId)
      .maybeSingle();
    if (deliveryError)
      throw new HttpError(
        503,
        "Der Versanddatensatz kann gerade nicht geladen werden.",
      );
    if (!delivery)
      throw new HttpError(404, "Der Versanddatensatz wurde nicht gefunden.");
    if (delivery.status === "sent")
      throw new HttpError(409, "Diese E-Mail wurde bereits versendet.");
    let sent = false;

    if (delivery.template === "enrollment_activated") {
      const orderId = delivery.event_key.replace("enrollment-activated:", "");
      const { data: order, error: orderError } = await admin
        .from("orders")
        .select("user_id,payment_status")
        .eq("id", orderId)
        .single();
      if (orderError)
        throw new HttpError(
          503,
          "Die Bestellung kann gerade nicht geprüft werden.",
        );
      if (order?.payment_status !== "paid") {
        throw new HttpError(
          409,
          "Für diese Bestellung besteht keine aktive bezahlte Berechtigung.",
        );
      }
      const { data: enrollment, error: enrollmentError } = await admin
        .from("enrollments")
        .select("id")
        .eq("user_id", order.user_id)
        .eq("order_id", orderId)
        .in("status", ["active", "completed"])
        .maybeSingle();
      if (enrollmentError)
        throw new HttpError(
          503,
          "Die Berechtigung kann gerade nicht geprüft werden.",
        );
      if (!enrollment)
        throw new HttpError(409, "Der Schulungszugang ist nicht aktiv.");
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("first_name,email")
        .eq("auth_user_id", order.user_id)
        .single();
      if (profileError)
        throw new HttpError(
          503,
          "Das Profil kann gerade nicht geladen werden.",
        );
      if (order && profile) {
        const { data: checkoutIntent, error: intentError } = await admin
          .from("checkout_intents")
          .select("*")
          .eq("provisioned_order_id", orderId)
          .maybeSingle();
        if (intentError)
          throw new HttpError(
            503,
            "Die Vertragsbestätigung kann gerade nicht geladen werden.",
          );
        if (
          checkoutIntent &&
          (checkoutIntent.auth_user_id !== order.user_id ||
            checkoutIntent.email !== delivery.recipient_email)
        ) {
          throw new HttpError(
            409,
            "Der unveränderliche Empfänger der Vertragsbestätigung stimmt nicht überein.",
          );
        }
        sent = await sendEnrollmentActivatedEmail({
          userId: order.user_id,
          orderId,
          firstName: checkoutIntent?.first_name ?? profile.first_name,
          email: checkoutIntent?.email ?? profile.email,
          passwordCreatedDuringCheckout: checkoutIntent ? false : undefined,
          contractConfirmation: checkoutIntent
            ? contractConfirmationForIntent(checkoutIntent as CheckoutIntentRow)
            : undefined,
        });
      }
    } else if (delivery.template === "course_completed") {
      const [, userId, courseId] = delivery.event_key.split(":");
      if (!userId || !courseId)
        throw new HttpError(
          409,
          "Der Versanddatensatz enthält keine gültige Kurszuordnung.",
        );
      const [lessonResult, progressResult] = await Promise.all([
        admin
          .from("lessons")
          .select("id", { count: "exact", head: true })
          .eq("course_id", courseId)
          .eq("status", "published"),
        admin
          .from("lesson_progress")
          .select("lesson_id,video_completed,quiz_passed")
          .eq("user_id", userId),
      ]);
      if (lessonResult.error || progressResult.error) {
        throw new HttpError(
          503,
          "Der Kursabschluss kann gerade nicht geprüft werden.",
        );
      }
      const lessonCount = lessonResult.count;
      const progress = progressResult.data;
      if (
        lessonCount !== 7 ||
        (progress ?? []).filter(
          (item) => item.video_completed && item.quiz_passed,
        ).length < 7
      ) {
        throw new HttpError(409, "Der Kursabschluss ist nicht vollständig.");
      }
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("first_name,email")
        .eq("auth_user_id", userId)
        .single();
      if (profileError)
        throw new HttpError(
          503,
          "Das Profil kann gerade nicht geladen werden.",
        );
      if (profile && courseId) {
        sent = await sendCourseCompletedEmail({
          userId,
          courseId,
          firstName: profile.first_name,
          email: profile.email,
        });
      }
    } else if (delivery.template === "certificate_ready") {
      const certificateId = delivery.event_key.replace(
        "certificate-ready:",
        "",
      );
      const { data: certificate, error: certificateError } = await admin
        .from("certificates")
        .select(
          "id,user_id,certificate_number,participant_name,file_key,file_sha256,issued_at,status",
        )
        .eq("id", certificateId)
        .eq("status", "valid")
        .single();
      if (certificateError)
        throw new HttpError(
          503,
          "Das Zertifikat kann gerade nicht geladen werden.",
        );
      if (certificate) {
        const [profileResult, fileResult] = await Promise.all([
          admin
            .from("profiles")
            .select("first_name,email")
            .eq("auth_user_id", certificate.user_id)
            .single(),
          admin.storage
            .from(optionalEnv("CERTIFICATE_STORAGE_BUCKET") ?? "certificates")
            .download(certificate.file_key),
        ]);
        if (profileResult.error || fileResult.error) {
          throw new HttpError(
            503,
            "Die Zertifikats-E-Mail kann gerade nicht vorbereitet werden.",
          );
        }
        const profile = profileResult.data;
        const file = fileResult.data;
        if (profile && file) {
          const pdf = new Uint8Array(await file.arrayBuffer());
          if (
            createHash("sha256").update(pdf).digest("hex") !==
            certificate.file_sha256
          ) {
            throw new HttpError(
              503,
              "Die Zertifikatsdatei hat die Integritätsprüfung nicht bestanden.",
            );
          }
          sent = await sendCertificateReadyEmail({
            userId: certificate.user_id,
            certificateId: certificate.id,
            firstName: profile.first_name,
            email: profile.email,
            certificateNumber: certificate.certificate_number,
            issuedDate: new Intl.DateTimeFormat("de-DE", {
              dateStyle: "long",
              timeZone: "Europe/Berlin",
            }).format(new Date(certificate.issued_at)),
            pdf,
            filename: `${certificate.certificate_number}.pdf`,
          });
        }
      }
    } else if (delivery.template === "electronic_withdrawal_received") {
      const withdrawalId = delivery.event_key.replace(
        "electronic-withdrawal-received:",
        "",
      );
      const { data: withdrawal, error: withdrawalError } = await admin
        .from("withdrawal_requests")
        .select(
          "id,receipt_number,consumer_name,contract_reference,confirmation_email,declaration_text,received_at",
        )
        .eq("id", withdrawalId)
        .maybeSingle();
      if (withdrawalError)
        throw new HttpError(
          503,
          "Der Widerrufsnachweis kann gerade nicht geladen werden.",
        );
      if (!withdrawal)
        throw new HttpError(404, "Der Widerrufsnachweis wurde nicht gefunden.");
      sent = await sendWithdrawalReceivedEmail({
        withdrawalId: withdrawal.id,
        receiptNumber: withdrawal.receipt_number,
        consumerName: withdrawal.consumer_name,
        contractReference: withdrawal.contract_reference,
        confirmationEmail: withdrawal.confirmation_email,
        declarationText: withdrawal.declaration_text,
        receivedAt: withdrawal.received_at,
      });
    } else if (delivery.template === "contact_message") {
      const contactId = delivery.event_key.replace("contact:", "");
      const { data: contact, error: contactError } = await admin
        .from("contact_messages")
        .select("name,email,topic,message")
        .eq("id", contactId)
        .single();
      if (contactError)
        throw new HttpError(
          503,
          "Die Kontaktanfrage kann gerade nicht geladen werden.",
        );
      if (contact) {
        sent = await sendTransactionalEmail({
          to: delivery.recipient_email,
          template: delivery.template,
          eventKey: delivery.event_key,
          subject: `Kontaktanfrage: ${contact.topic}`,
          html: `<p>Name: ${escapeHtml(contact.name)}</p><p>E-Mail: ${escapeHtml(contact.email)}</p><p>Thema: ${escapeHtml(contact.topic)}</p><p>${escapeHtml(contact.message).replace(/\n/g, "<br>")}</p>`,
          text: `Name: ${contact.name}\nE-Mail: ${contact.email}\n\n${contact.message}`,
        });
      }
    } else if (delivery.template === "payment_dispute_alert") {
      const orderId = delivery.event_key.replace("payment-dispute:", "");
      const { data: order, error: orderError } = await admin
        .from("orders")
        .select("id,payment_status")
        .eq("id", orderId)
        .maybeSingle();
      if (orderError)
        throw new HttpError(
          503,
          "Die angefochtene Bestellung kann gerade nicht geladen werden.",
        );
      if (!order || order.payment_status !== "disputed") {
        throw new HttpError(
          409,
          "Für diese Bestellung liegt keine aktive Zahlungsanfechtung vor.",
        );
      }
      sent = await sendTransactionalEmail({
        to: delivery.recipient_email,
        template: delivery.template,
        eventKey: delivery.event_key,
        subject: "Handlungsbedarf: Stripe-Zahlungsanfechtung",
        html: `<p>Stripe hat eine Zahlungsanfechtung für die Bestellung <strong>${order.id}</strong> gemeldet.</p><p>Der Kurszugang wurde automatisch gesperrt. Bitte prüfe den Vorgang zeitnah im Stripe-Dashboard und dokumentiere die weitere Bearbeitung.</p>`,
        text: `Stripe hat eine Zahlungsanfechtung für die Bestellung ${order.id} gemeldet. Der Kurszugang wurde automatisch gesperrt. Bitte prüfe den Vorgang zeitnah im Stripe-Dashboard.`,
      });
    } else {
      throw new HttpError(
        409,
        "Für diese E-Mail-Vorlage ist kein sicherer Wiederholungsversuch definiert.",
      );
    }
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.id,
      actor_role: "admin",
      action: "email_retry_requested",
      entity_type: "email_delivery",
      entity_id: delivery.id,
      metadata: { sent },
    });
    if (auditError) throw auditError;
    if (!sent)
      throw new HttpError(
        503,
        "Die E-Mail konnte noch nicht erneut versendet werden.",
      );
    return Response.json(
      { ok: true, sent: true },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
