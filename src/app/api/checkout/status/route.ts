import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const querySchema = z.string().min(8).max(255);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const sessionId = querySchema.parse(
      new URL(request.url).searchParams.get("session_id"),
    );
    await enforceRateLimit({
      bucket: "checkout-status",
      subject: user.id,
      maximum: 80,
      windowSeconds: 600,
    });
    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select(
        "id,course_id,payment_status,amount_total,currency,tax_amount,billing_snapshot",
      )
      .eq("user_id", user.id)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (orderError) {
      throw new HttpError(
        503,
        "Die Bestelldaten konnten derzeit nicht geladen werden.",
      );
    }
    if (!order) {
      return Response.json(
        { status: "failed" },
        { status: 404, headers: noStoreHeaders() },
      );
    }
    const revokedResponse = () =>
      Response.json(
        {
          status: "revoked",
          message:
            "Diese Zahlung ist erfasst, der zugehörige Kurszugang wurde jedoch administrativ gesperrt. Bitte starte keine weitere Zahlung und kontaktiere den Support.",
        },
        { headers: noStoreHeaders() },
      );
    const { data: orderEnrollment, error: enrollmentError } = await admin
      .from("enrollments")
      .select("status")
      .eq("user_id", user.id)
      .eq("order_id", order.id)
      .maybeSingle();
    if (enrollmentError) {
      throw new HttpError(
        503,
        "Der Zugangsstatus konnte derzeit nicht geladen werden.",
      );
    }
    if (orderEnrollment?.status === "revoked") {
      return revokedResponse();
    }
    let enrollment = ["active", "completed"].includes(
      orderEnrollment?.status ?? "",
    )
      ? orderEnrollment
      : null;
    let duplicatePayment = false;
    if (!enrollment && order.payment_status === "paid" && order.course_id) {
      const { data: courseEnrollment, error: courseEnrollmentError } =
        await admin
          .from("enrollments")
          .select("status")
          .eq("user_id", user.id)
          .eq("course_id", order.course_id)
          .in("status", ["active", "completed"])
          .maybeSingle();
      if (courseEnrollmentError) {
        throw new HttpError(
          503,
          "Der Zugangsstatus konnte derzeit nicht geladen werden.",
        );
      }
      if (!courseEnrollment) {
        const { data: revokedEnrollment, error: revokedEnrollmentError } =
          await admin
            .from("enrollments")
            .select("status")
            .eq("user_id", user.id)
            .eq("course_id", order.course_id)
            .eq("status", "revoked")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (revokedEnrollmentError) {
          throw new HttpError(
            503,
            "Der Zugangsstatus konnte derzeit nicht geladen werden.",
          );
        }
        if (revokedEnrollment) return revokedResponse();
      }
      enrollment = courseEnrollment;
      duplicatePayment = Boolean(courseEnrollment);
    }
    if (enrollment) {
      const snapshot =
        typeof order.billing_snapshot === "object" &&
        order.billing_snapshot !== null
          ? (order.billing_snapshot as Record<string, unknown>)
          : {};
      return Response.json(
        {
          status: "active",
          redirectUrl: "/dashboard",
          duplicatePayment,
          message: duplicatePayment
            ? "Diese Zahlung ist bestätigt und dein Schulungszugang ist bereits aktiv. Wir haben eine mögliche Doppelzahlung erkannt. Bitte prüfe deine Bestellungen und kontaktiere den Support; starte keine weitere Zahlung."
            : "Deine Zahlung ist bestätigt und dein Schulungsplatz ist freigeschaltet. Prüfe hier noch einmal deine Bestelldaten.",
          order: {
            productName:
              typeof snapshot.productName === "string"
                ? snapshot.productName
                : null,
            amountTotal: order.amount_total,
            currency: order.currency,
            taxAmount: order.tax_amount,
          },
        },
        { headers: noStoreHeaders() },
      );
    }
    if (
      ["failed", "expired", "refunded", "disputed"].includes(
        order.payment_status,
      )
    ) {
      return Response.json({ status: "failed" }, { headers: noStoreHeaders() });
    }
    return Response.json({ status: "pending" }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
