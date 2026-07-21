import { z } from "zod";

import { requireAdmin } from "@/lib/server/auth";
import { HttpError, jsonError, noStoreHeaders } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const statusSchema = z.enum([
  "all",
  "pending",
  "verified",
  "rejected",
  "resolved",
]);

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const search = new URL(request.url).searchParams;
    const status = statusSchema.parse(search.get("status") ?? "pending");
    const query = (search.get("q") ?? "")
      .trim()
      .toLocaleLowerCase("de")
      .slice(0, 120);
    const admin = getSupabaseAdmin();

    let reviewQuery = admin
      .from("legacy_certificate_reviews")
      .select(
        "id,user_id,course_id,payment_source,source_id,reported_status,reported_course_version,review_status,evidence_summary,evidence_reference,reviewed_by,reviewed_at,mapped_certificate_id,resolved_at,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(250);
    if (status !== "all") reviewQuery = reviewQuery.eq("review_status", status);
    const { data: reviews, error: reviewError } = await reviewQuery;
    if (reviewError) {
      throw new HttpError(
        503,
        "Die historischen Zertifikatsprüfungen können gerade nicht geladen werden.",
      );
    }

    const userIds = [
      ...new Set((reviews ?? []).map((review) => review.user_id)),
    ];
    const courseIds = [
      ...new Set((reviews ?? []).map((review) => review.course_id)),
    ];
    const certificateIds = [
      ...new Set(
        (reviews ?? [])
          .map((review) => review.mapped_certificate_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [profileResult, courseResult, certificateResult] = await Promise.all([
      userIds.length
        ? admin
            .from("profiles")
            .select("auth_user_id,first_name,last_name,email,certificate_name")
            .in("auth_user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? admin.from("courses").select("id,title,version").in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      certificateIds.length
        ? admin
            .from("certificates")
            .select("id,certificate_number,status,issued_at")
            .in("id", certificateIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileResult.error || courseResult.error || certificateResult.error) {
      throw new HttpError(
        503,
        "Die Details der historischen Zertifikatsprüfungen können gerade nicht geladen werden.",
      );
    }

    const profiles = new Map(
      (profileResult.data ?? []).map((profile) => [
        profile.auth_user_id,
        profile,
      ]),
    );
    const courses = new Map(
      (courseResult.data ?? []).map((course) => [course.id, course]),
    );
    const certificates = new Map(
      (certificateResult.data ?? []).map((certificate) => [
        certificate.id,
        certificate,
      ]),
    );
    const rows = (reviews ?? []).flatMap((review) => {
      const profile = profiles.get(review.user_id);
      const course = courses.get(review.course_id);
      const certificate = review.mapped_certificate_id
        ? certificates.get(review.mapped_certificate_id)
        : null;
      const participantName =
        profile?.certificate_name ||
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
      const haystack = [
        participantName,
        profile?.email,
        review.payment_source,
        review.source_id,
        review.reported_status,
        review.reported_course_version,
        review.review_status,
        certificate?.certificate_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de");
      if (query && !haystack.includes(query)) return [];
      return [
        {
          id: review.id,
          userId: review.user_id,
          participantName: participantName || null,
          email: profile?.email ?? null,
          course: course
            ? { id: course.id, title: course.title, version: course.version }
            : null,
          paymentSource: review.payment_source,
          sourceId: review.source_id,
          reportedStatus: review.reported_status,
          reportedCourseVersion: review.reported_course_version,
          reviewStatus: review.review_status,
          evidenceSummary: review.evidence_summary,
          evidenceReference: review.evidence_reference,
          reviewedBy: review.reviewed_by,
          reviewedAt: review.reviewed_at,
          resolvedAt: review.resolved_at,
          createdAt: review.created_at,
          updatedAt: review.updated_at,
          mappedCertificate: certificate
            ? {
                id: certificate.id,
                number: certificate.certificate_number,
                status: certificate.status,
                issuedAt: certificate.issued_at,
              }
            : null,
        },
      ];
    });

    return Response.json({ reviews: rows }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
