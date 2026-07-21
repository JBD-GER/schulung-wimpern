import { requireAdmin } from "@/lib/server/auth";
import { jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
    const { userId } = await context.params;
    const admin = getSupabaseAdmin();
    const [
      profile,
      orders,
      enrollments,
      progress,
      attempts,
      certificates,
      legacyCertificateReviews,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "auth_user_id,first_name,last_name,certificate_name,email,phone,billing_type,company_name,contact_person,billing_address,tax_id,email_verified_at,created_at",
        )
        .eq("auth_user_id", userId)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          "id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_invoice_id,amount_total,currency,tax_amount,payment_status,business_purchase,payment_source,created_at,paid_at,refunded_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      admin
        .from("enrollments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      admin
        .from("lesson_progress")
        .select(
          "lesson_id,course_version,watched_seconds,video_completed,quiz_passed,legacy_completed,completed_at,updated_at",
        )
        .eq("user_id", userId),
      admin
        .from("quiz_attempts")
        .select(
          "id,lesson_id,course_version,started_at,submitted_at,score,passed,attempt_number",
        )
        .eq("user_id", userId)
        .order("started_at", { ascending: false }),
      admin
        .from("certificates")
        .select(
          "id,course_id,certificate_number,participant_name,course_version,issued_at,revoked_at,status,file_sha256",
        )
        .eq("user_id", userId)
        .order("issued_at", { ascending: false }),
      admin
        .from("legacy_certificate_reviews")
        .select(
          "id,course_id,payment_source,source_id,reported_status,reported_course_version,review_status,evidence_summary,evidence_reference,reviewed_at,mapped_certificate_id,created_at,updated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    const failure = [
      profile,
      orders,
      enrollments,
      progress,
      attempts,
      certificates,
      legacyCertificateReviews,
    ].find((result) => result.error);
    if (failure?.error) throw failure.error;
    return Response.json(
      {
        participant: profile.data,
        orders: orders.data ?? [],
        enrollments: enrollments.data ?? [],
        progress: progress.data ?? [],
        quizAttempts: attempts.data ?? [],
        certificates: certificates.data ?? [],
        legacyCertificateReviews: legacyCertificateReviews.data ?? [],
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
