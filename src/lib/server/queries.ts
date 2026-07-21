import "server-only";

import { progressForCourseVersion } from "@/lib/learning-progress";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { assertLessonUnlocked, requireEnrollment } from "./access";
import { isAdminUser, requireAdmin, requireUser } from "./auth";
import { finalizeCourseCompletion } from "./certificate";
import {
  certificateDownloadAvailable,
  selectEffectiveCertificate,
} from "./certificate-state";
import { HttpError } from "./http";
import { getStripe } from "./stripe";

interface LessonRow {
  id: string;
  course_id: string;
  position: number;
  slug: string;
  section_title: string | null;
  title: string;
  description: string;
  duration_seconds: number;
  watch_threshold: number;
  status: string;
}

interface ProgressRow {
  lesson_id: string;
  course_version: string | null;
  watched_seconds: number;
  video_completed: boolean;
  quiz_passed: boolean;
  legacy_completed: boolean;
  completed_at: string | null;
}

function learningCompleted(
  progress: ProgressRow | null | undefined,
  currentCourseVersion: string,
): boolean {
  return Boolean(
    progress?.legacy_completed ||
    (progress?.course_version === currentCourseVersion &&
      progress?.video_completed &&
      progress?.quiz_passed),
  );
}

export async function getDashboardData() {
  const user = await requireUser();
  const admin = getSupabaseAdmin();
  const [
    { data: profile, error: profileError },
    { data: enrollment, error: enrollmentError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name,last_name,certificate_name,email")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    admin
      .from("enrollments")
      .select("id,course_id,status,granted_at")
      .eq("user_id", user.id)
      .in("status", ["active", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileError || enrollmentError)
    throw new HttpError(503, "Das Dashboard kann gerade nicht geladen werden.");
  if (!enrollment) {
    return {
      profile,
      enrollment: null,
      course: null,
      lessons: [],
      completedCount: 0,
      progressPercent: 0,
      adminPreview: false,
      effectiveCertificate: null,
      validCertificateAvailable: false,
      legacyCertificateReview: null,
    };
  }

  const adminPreview = await isAdminUser(user);

  const [
    { data: course, error: courseError },
    { data: lessons, error: lessonError },
    { data: progress, error: progressError },
    { data: certificateHistory, error: certificateError },
    { data: legacyCertificateReview, error: legacyReviewError },
  ] = await Promise.all([
    admin
      .from("courses")
      .select("id,slug,title,description,level,version,total_learning_minutes")
      .eq("id", enrollment.course_id)
      .single(),
    admin
      .from("lessons")
      .select(
        "id,course_id,position,slug,section_title,title,description,duration_seconds,watch_threshold,status",
      )
      .eq("course_id", enrollment.course_id)
      .eq("status", "published")
      .order("position"),
    admin
      .from("lesson_progress")
      .select(
        "lesson_id,course_version,watched_seconds,video_completed,quiz_passed,legacy_completed,completed_at",
      )
      .eq("user_id", user.id),
    admin
      .from("certificates")
      .select(
        "id,certificate_number,status,file_key,file_sha256,issued_at,created_at",
      )
      .eq("user_id", user.id)
      .eq("course_id", enrollment.course_id)
      .in("status", ["generating", "replacing", "valid", "revoked", "failed"])
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("legacy_certificate_reviews")
      .select(
        "id,reported_status,review_status,mapped_certificate_id,created_at",
      )
      .eq("user_id", user.id)
      .eq("course_id", enrollment.course_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (
    courseError ||
    lessonError ||
    progressError ||
    certificateError ||
    legacyReviewError
  ) {
    throw new HttpError(503, "Das Dashboard kann gerade nicht geladen werden.");
  }
  const progressMap = new Map(
    ((progress ?? []) as ProgressRow[]).map((item) => [
      item.lesson_id,
      progressForCourseVersion(item, course!.version),
    ]),
  );
  const lessonRows = (lessons ?? []) as LessonRow[];
  let prerequisitesComplete = true;
  const decoratedLessons = lessonRows.map((lesson) => {
    const itemProgress = progressMap.get(lesson.id) ?? null;
    const completed = learningCompleted(itemProgress, course!.version);
    const status = completed
      ? "completed"
      : !adminPreview && !prerequisitesComplete
        ? "locked"
        : itemProgress
          ? "in_progress"
          : "available";
    prerequisitesComplete = prerequisitesComplete && completed;
    return { ...lesson, progress: itemProgress, learningStatus: status };
  });
  const completedCount = decoratedLessons.filter(
    (lesson) => lesson.learningStatus === "completed",
  ).length;
  const effectiveCertificate = selectEffectiveCertificate(
    certificateHistory ?? [],
  );
  return {
    profile,
    enrollment,
    course,
    lessons: decoratedLessons,
    completedCount,
    progressPercent: lessonRows.length
      ? Math.round((completedCount / lessonRows.length) * 100)
      : 0,
    adminPreview,
    effectiveCertificate: effectiveCertificate
      ? {
          id: effectiveCertificate.id,
          number: effectiveCertificate.certificate_number,
          status: effectiveCertificate.status,
          issuedAt: effectiveCertificate.issued_at,
        }
      : null,
    validCertificateAvailable:
      certificateDownloadAvailable(effectiveCertificate),
    legacyCertificateReview: legacyCertificateReview
      ? {
          id: legacyCertificateReview.id,
          reportedStatus: legacyCertificateReview.reported_status,
          reviewStatus: legacyCertificateReview.review_status,
          mappedCertificateId: legacyCertificateReview.mapped_certificate_id,
        }
      : null,
  };
}

export async function getLessonPageData(slug: string) {
  const user = await requireUser();
  const admin = getSupabaseAdmin();
  const { data: lesson, error } = await admin
    .from("lessons")
    .select(
      "id,course_id,position,slug,section_title,title,description,duration_seconds,watch_threshold,status",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error)
    throw new HttpError(503, "Die Lektion kann gerade nicht geladen werden.");
  if (!lesson)
    throw new HttpError(404, "Die Lektion wurde nicht gefunden.", "not_found");
  await requireEnrollment(user.id, lesson.course_id);
  const adminPreview = await isAdminUser(user);
  if (!adminPreview) await assertLessonUnlocked(user.id, lesson.id);

  const [
    { data: course, error: courseError },
    { data: lessons, error: lessonError },
    { data: allProgress, error: progressError },
    { count: approvedCount, error: approvalError },
    { data: materials, error: materialError },
  ] = await Promise.all([
    admin
      .from("courses")
      .select("id,slug,title,version,total_learning_minutes")
      .eq("id", lesson.course_id)
      .single(),
    admin
      .from("lessons")
      .select("id,position,slug,title,duration_seconds")
      .eq("course_id", lesson.course_id)
      .eq("status", "published")
      .order("position"),
    admin
      .from("lesson_progress")
      .select(
        "lesson_id,course_version,watched_seconds,video_completed,quiz_passed,legacy_completed,completed_at",
      )
      .eq("user_id", user.id),
    admin
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lesson.id)
      .eq("status", "approved"),
    admin
      .from("lesson_materials")
      .select("id,title,mime_type,position")
      .eq("lesson_id", lesson.id)
      .eq("status", "published")
      .order("position"),
  ]);
  if (
    courseError ||
    lessonError ||
    progressError ||
    approvalError ||
    materialError
  ) {
    throw new HttpError(503, "Die Lektion kann gerade nicht geladen werden.");
  }
  const progressMap = new Map(
    ((allProgress ?? []) as ProgressRow[]).map((item) => [
      item.lesson_id,
      progressForCourseVersion(item, course!.version),
    ]),
  );
  let prerequisitesComplete = true;
  const decoratedLessons = ((lessons ?? []) as LessonRow[]).map((item) => {
    const itemProgress = progressMap.get(item.id) ?? null;
    const completed = learningCompleted(itemProgress, course!.version);
    const learningStatus = completed
      ? "completed"
      : !adminPreview && !prerequisitesComplete
        ? "locked"
        : itemProgress
          ? "in_progress"
          : "available";
    prerequisitesComplete = prerequisitesComplete && completed;
    return { ...item, progress: itemProgress, learningStatus };
  });
  const progress = progressMap.get(lesson.id) ?? null;
  const quizPublished = approvedCount === 5;
  return {
    lesson: {
      ...lesson,
      materials: (materials ?? []).map((material) => ({
        ...material,
        url: `/api/materials/${material.id}/download`,
      })),
    },
    course,
    progress,
    lessons: decoratedLessons,
    quizAvailable: Boolean(
      progress?.course_version === course!.version &&
      progress?.video_completed &&
      quizPublished,
    ),
    quizPublished,
    adminPreview,
  };
}

export async function getCertificateData() {
  const user = await requireUser();
  const enrollment = await requireEnrollment(user.id);
  const admin = getSupabaseAdmin();
  const [
    { data: certificateHistory, error: certificateError },
    { data: course, error: courseError },
    { data: lessons, error: lessonError },
    { data: progress, error: progressError },
    { data: completionSnapshots, error: snapshotError },
    { data: legacyCertificateReview, error: legacyReviewError },
  ] = await Promise.all([
    admin
      .from("certificates")
      .select(
        "id,certificate_number,participant_name,issued_at,status,course_version,completion_snapshot_id,file_key,file_sha256,updated_at,created_at",
      )
      .eq("user_id", user.id)
      .eq("course_id", enrollment.course_id)
      .in("status", ["generating", "replacing", "valid", "revoked", "failed"])
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("courses")
      .select("id,version")
      .eq("id", enrollment.course_id)
      .single(),
    admin
      .from("lessons")
      .select("id,title,position")
      .eq("course_id", enrollment.course_id)
      .eq("status", "published")
      .order("position"),
    admin
      .from("lesson_progress")
      .select(
        "lesson_id,course_version,video_completed,quiz_passed,legacy_completed",
      )
      .eq("user_id", user.id),
    admin
      .from("course_completion_snapshots")
      .select("id,course_version,completed_at")
      .eq("user_id", user.id)
      .eq("course_id", enrollment.course_id)
      .order("completed_at", { ascending: false })
      .limit(1),
    admin
      .from("legacy_certificate_reviews")
      .select(
        "id,reported_status,reported_course_version,review_status,mapped_certificate_id,created_at",
      )
      .eq("user_id", user.id)
      .eq("course_id", enrollment.course_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  let currentCertificateHistory = certificateHistory ?? [];
  let certificate = selectEffectiveCertificate(currentCertificateHistory);
  if (
    certificateError ||
    courseError ||
    lessonError ||
    progressError ||
    snapshotError ||
    legacyReviewError ||
    !course
  ) {
    throw new HttpError(
      503,
      "Der Zertifikatsbereich kann gerade nicht geladen werden.",
    );
  }
  const learningDone = new Set(
    (progress ?? [])
      .filter(
        (item) =>
          item.legacy_completed ||
          (item.course_version === course.version &&
            item.video_completed &&
            item.quiz_passed),
      )
      .map((item) => item.lesson_id),
  );
  const completionSnapshot = completionSnapshots?.[0] ?? null;
  const allLessonsCompleted = completionSnapshot !== null;
  const snapshotCertificate = completionSnapshot
    ? currentCertificateHistory.find(
        (item) =>
          item.completion_snapshot_id === completionSnapshot.id &&
          item.course_version === completionSnapshot.course_version,
      )
    : null;
  const generatingIsStale =
    snapshotCertificate?.status === "generating" &&
    Date.now() - new Date(snapshotCertificate.updated_at).getTime() >
      15 * 60 * 1000;
  let finalizationFailed = false;
  if (
    allLessonsCompleted &&
    (!snapshotCertificate ||
      snapshotCertificate.status === "failed" ||
      generatingIsStale)
  ) {
    try {
      await finalizeCourseCompletion(user.id, enrollment.course_id);
      const { data: refreshedCertificates, error: refreshError } = await admin
        .from("certificates")
        .select(
          "id,certificate_number,participant_name,issued_at,status,course_version,completion_snapshot_id,file_key,file_sha256,updated_at,created_at",
        )
        .eq("user_id", user.id)
        .eq("course_id", enrollment.course_id)
        .in("status", ["generating", "replacing", "valid", "revoked", "failed"])
        .order("created_at", { ascending: false })
        .limit(25);
      if (refreshError) throw refreshError;
      currentCertificateHistory = refreshedCertificates ?? [];
      certificate = selectEffectiveCertificate(currentCertificateHistory);
    } catch {
      // A read should still render the durable snapshot and expose the explicit
      // POST retry path when email, storage, or certificate generation is down.
      finalizationFailed = true;
    }
  }
  return {
    certificate,
    downloadAvailable: certificateDownloadAvailable(certificate),
    completedCount: allLessonsCompleted ? 7 : learningDone.size,
    openLessons: allLessonsCompleted
      ? []
      : (lessons ?? [])
          .filter((lesson) => !learningDone.has(lesson.id))
          .map((lesson) => lesson.title),
    retryAvailable: allLessonsCompleted,
    finalizationFailed,
    legacyCertificateReview: legacyCertificateReview
      ? {
          id: legacyCertificateReview.id,
          reportedStatus: legacyCertificateReview.reported_status,
          reportedCourseVersion:
            legacyCertificateReview.reported_course_version,
          reviewStatus: legacyCertificateReview.review_status,
          mappedCertificateId: legacyCertificateReview.mapped_certificate_id,
        }
      : null,
  };
}

export async function getProfileData() {
  const user = await requireUser();
  const admin = getSupabaseAdmin();
  const [
    { data: profile, error: profileError },
    { data: orders, error: orderError },
    { data: course, error: courseError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "first_name,last_name,certificate_name,email,phone,billing_type,company_name,contact_person,billing_address,tax_id,email_verified_at",
      )
      .eq("auth_user_id", user.id)
      .single(),
    admin
      .from("orders")
      .select(
        "id,stripe_invoice_id,amount_total,currency,payment_status,billing_snapshot,created_at,paid_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("courses")
      .select("title")
      .eq("slug", "online-schulung-wimpernverlaengerung")
      .maybeSingle(),
  ]);
  if (profileError || orderError || courseError) {
    throw new HttpError(503, "Das Profil kann gerade nicht geladen werden.");
  }
  const enrichedOrders = await Promise.all(
    (orders ?? []).map(async (order) => {
      let invoiceNumber: string | null = null;
      let invoiceUrl: string | null = null;
      if (order.stripe_invoice_id) {
        try {
          const invoice = await getStripe().invoices.retrieve(
            order.stripe_invoice_id,
          );
          invoiceNumber = invoice.number;
          invoiceUrl =
            invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null;
        } catch {
          // The profile still shows the immutable local order if Stripe is temporarily unavailable.
        }
      }
      return {
        ...order,
        productName:
          typeof order.billing_snapshot === "object" &&
          order.billing_snapshot !== null &&
          typeof (order.billing_snapshot as Record<string, unknown>)
            .productName === "string"
            ? String(
                (order.billing_snapshot as Record<string, unknown>).productName,
              )
            : (course?.title ?? null),
        purchasedAt: order.paid_at ?? order.created_at,
        invoiceNumber,
        invoiceUrl,
      };
    }),
  );
  return { profile, orders: enrichedOrders };
}

export async function getAdminOverview() {
  await requireAdmin();
  const admin = getSupabaseAdmin();
  const [
    profiles,
    activeEnrollments,
    completions,
    paidOrders,
    refunds,
    certificates,
    passedAttempts,
    failedAttempts,
    emailErrors,
    enrollmentUsers,
    completionProgress,
    recentOrders,
    recentEnrollments,
    openDataRequests,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "completed"]),
    admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid"),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "refunded"),
    admin
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("status", "valid"),
    admin
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("passed", true),
    admin
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("passed", false),
    admin
      .from("email_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    admin
      .from("enrollments")
      .select("user_id")
      .in("status", ["active", "completed"]),
    admin
      .from("lesson_progress")
      .select("user_id,video_completed,quiz_passed,legacy_completed"),
    admin
      .from("orders")
      .select("id,user_id,amount_total,currency,payment_status,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("enrollments")
      .select("id,user_id,course_id,status,granted_at")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("data_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "verified", "processing"]),
  ]);
  const failedAdminQuery = [
    profiles,
    activeEnrollments,
    completions,
    paidOrders,
    refunds,
    certificates,
    passedAttempts,
    failedAttempts,
    emailErrors,
    enrollmentUsers,
    completionProgress,
    recentOrders,
    recentEnrollments,
    openDataRequests,
  ].find((result) => result.error);
  if (failedAdminQuery?.error) {
    throw new HttpError(
      503,
      "Die Admin-Kennzahlen können gerade nicht geladen werden.",
    );
  }
  const recentUserIds = [
    ...(recentOrders.data ?? []).map((item) => item.user_id),
    ...(recentEnrollments.data ?? []).map((item) => item.user_id),
  ];
  const { data: recentProfiles, error: recentProfileError } =
    recentUserIds.length
      ? await admin
          .from("profiles")
          .select("auth_user_id,first_name,last_name,email")
          .in("auth_user_id", [...new Set(recentUserIds)])
      : { data: [], error: null };
  if (recentProfileError)
    throw new HttpError(
      503,
      "Die Admin-Aktivitäten können gerade nicht geladen werden.",
    );
  const profileByUser = new Map(
    (recentProfiles ?? []).map((profile) => [profile.auth_user_id, profile]),
  );
  const completedByUser = new Map<string, number>();
  for (const item of completionProgress.data ?? []) {
    if (item.legacy_completed || (item.video_completed && item.quiz_passed)) {
      completedByUser.set(
        item.user_id,
        (completedByUser.get(item.user_id) ?? 0) + 1,
      );
    }
  }
  const learnerIds = new Set(
    (enrollmentUsers.data ?? []).map((item) => item.user_id),
  );
  const completedLessonCount = (completionProgress.data ?? []).filter(
    (item) =>
      learnerIds.has(item.user_id) &&
      (item.legacy_completed || (item.video_completed && item.quiz_passed)),
  ).length;
  const averageProgress = learnerIds.size
    ? Math.round((completedLessonCount / (learnerIds.size * 7)) * 100)
    : 0;
  return {
    counts: {
      participants: profiles.count ?? 0,
      activeEnrollments: activeEnrollments.count ?? 0,
      completions: completions.count ?? 0,
      averageProgress,
      passedAttempts: passedAttempts.count ?? 0,
      failedAttempts: failedAttempts.count ?? 0,
      payments: paidOrders.count ?? 0,
      refunds: refunds.count ?? 0,
      certificates: certificates.count ?? 0,
      emailErrors: emailErrors.count ?? 0,
      openDataRequests: openDataRequests.count ?? 0,
    },
    recentOrders: (recentOrders.data ?? []).map((order) => {
      const profile = profileByUser.get(order.user_id);
      return {
        ...order,
        customer: profile
          ? `${profile.first_name} ${profile.last_name}`.trim() || profile.email
          : null,
        email: profile?.email ?? null,
      };
    }),
    recentEnrollments: (recentEnrollments.data ?? []).map((enrollment) => {
      const profile = profileByUser.get(enrollment.user_id);
      return {
        ...enrollment,
        customer: profile
          ? `${profile.first_name} ${profile.last_name}`.trim() || profile.email
          : null,
        email: profile?.email ?? null,
        progressPercent: Math.round(
          ((completedByUser.get(enrollment.user_id) ?? 0) / 7) * 100,
        ),
      };
    }),
  };
}
