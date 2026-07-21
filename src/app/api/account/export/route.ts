import { requireUser } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireUser();
    const admin = getSupabaseAdmin();
    const [
      profile,
      orders,
      enrollments,
      progress,
      attempts,
      certificates,
      legacyCertificateReviews,
      consents,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          "id,stripe_invoice_id,stripe_price_id,amount_total,currency,tax_amount,payment_status,business_purchase,created_at,paid_at,refunded_at",
        )
        .eq("user_id", user.id),
      admin.from("enrollments").select("*").eq("user_id", user.id),
      admin.from("lesson_progress").select("*").eq("user_id", user.id),
      admin
        .from("quiz_attempts")
        .select(
          "id,lesson_id,course_version,started_at,submitted_at,score,passed,attempt_number",
        )
        .eq("user_id", user.id),
      admin
        .from("certificates")
        .select(
          "certificate_number,course_version,issued_at,revoked_at,status,file_sha256",
        )
        .eq("user_id", user.id),
      admin
        .from("legacy_certificate_reviews")
        .select(
          "reported_status,reported_course_version,review_status,evidence_summary,evidence_reference,reviewed_at,resolved_at,created_at,updated_at",
        )
        .eq("user_id", user.id),
      admin
        .from("consent_records")
        .select("consent_type,consent_version,granted,created_at")
        .eq("user_id", user.id),
    ]);
    const failedQuery = [
      profile,
      orders,
      enrollments,
      progress,
      attempts,
      certificates,
      legacyCertificateReviews,
      consents,
    ].find((result) => result.error);
    if (failedQuery?.error) {
      throw new HttpError(
        503,
        "Der vollständige Datenexport kann gerade nicht erstellt werden.",
      );
    }
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: profile.data,
        orders: orders.data ?? [],
        enrollments: enrollments.data ?? [],
        lessonProgress: progress.data ?? [],
        quizAttempts: attempts.data ?? [],
        certificates: certificates.data ?? [],
        legacyCertificateReviews: legacyCertificateReviews.data ?? [],
        consents: consents.data ?? [],
      },
      null,
      2,
    );
    return new Response(body, {
      headers: noStoreHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="meine-daten.json"',
        "X-Content-Type-Options": "nosniff",
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
