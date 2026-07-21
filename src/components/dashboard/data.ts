import "server-only";

import { redirect } from "next/navigation";
import { COURSE, LESSONS, type Lesson } from "@/data/course";
import { requireEnrollment, assertLessonUnlocked } from "@/lib/server/access";
import { isAdminUser, requireAdmin, requireUser } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import {
  getAdminOverview,
  getCertificateData,
  getDashboardData,
  getLessonPageData,
  getProfileData,
} from "@/lib/server/queries";

type UnknownRecord = Record<string, unknown>;

export type LessonUiStatus =
  "locked" | "available" | "in_progress" | "completed";

export type LessonSummary = Lesson & {
  id: string | null;
  status: LessonUiStatus;
  watchedPercent: number;
  quizPassed: boolean;
  legacyCompleted: boolean;
};

export type ShellData = {
  userId: string;
  email: string | null;
  firstName: string | null;
  initials: string;
  isAdmin: boolean;
};

export type DashboardData = {
  hasAccess: boolean;
  loadFailed: boolean;
  adminPreview: boolean;
  course: CourseSummary;
  firstName: string | null;
  completedCount: number;
  progressPercent: number;
  lessons: LessonSummary[];
  currentLesson: LessonSummary | null;
  lastLesson: LessonSummary | null;
  courseCompleted: boolean;
  certificateReady: boolean;
  certificateStatus: string | null;
};

export type CourseSummary = {
  title: string;
  description: string;
  level: string;
  version: string;
  learningMinutes: number;
  learningScope: string;
};

export type LessonPageData = {
  available: boolean;
  loadFailed: boolean;
  adminPreview: boolean;
  courseCompleted: boolean;
  unlocked: boolean;
  lesson: LessonSummary | null;
  lessons: LessonSummary[];
  watchedPercent: number;
  quizAvailable: boolean;
  quizPublished: boolean;
  materials: { title: string; url: string }[];
};

export type CertificateData = {
  hasAccess: boolean;
  loadFailed: boolean;
  completedCount: number;
  openLessons: string[];
  courseCompleted: boolean;
  downloadAvailable: boolean;
  retryAvailable: boolean;
  confirmationRequired: boolean;
  suggestedCertificateName: string;
  confirmedCertificateName: string | null;
  legacyCertificateReview: null | {
    reportedStatus: string;
    reviewStatus: "pending" | "verified" | "rejected" | "resolved" | "unknown";
  };
  certificate: null | {
    fullName: string | null;
    number: string | null;
    issuedAt: string | null;
    courseVersion: string | null;
    status:
      | "generating"
      | "replacing"
      | "valid"
      | "revoked"
      | "failed"
      | "archived"
      | "unknown";
  };
};

export type ProfileData = {
  loadFailed: boolean;
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    certificateName: string;
    billingType: "private" | "company";
    companyName: string;
    contactPerson: string;
    billingStreet: string;
    billingPostalCode: string;
    billingCity: string;
    billingCountry: string;
    taxId: string;
  };
  orders: Array<{
    id: string;
    productName: string | null;
    purchasedAt: string | null;
    amount: string | null;
    status: string | null;
    invoiceNumber: string | null;
    invoiceUrl: string | null;
    contractConfirmationUrl: string | null;
  }>;
};

export type AdminData = {
  loadFailed: boolean;
  counts: {
    participants: number | null;
    activeEnrollments: number | null;
    completions: number | null;
    averageProgress: number | null;
    passedAttempts: number | null;
    failedAttempts: number | null;
    payments: number | null;
    refunds: number | null;
    certificates: number | null;
    emailErrors: number | null;
    openDataRequests: number | null;
  };
  recentOrders: Array<{
    id: string;
    customer: string | null;
    createdAt: string | null;
    status: string | null;
    amount: string | null;
  }>;
  recentEnrollments: Array<{
    id: string;
    customer: string | null;
    grantedAt: string | null;
    status: string | null;
    progress: number | null;
  }>;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is UnknownRecord => item !== null)
    : [];
}

function read(record: UnknownRecord | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "true") return true;
  if (value === 0 || value === "false") return false;
  return null;
}

function boundedPercent(value: unknown): number {
  const parsed = number(value) ?? 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function boundedLearningPercent(value: unknown): number {
  const parsed = number(value) ?? 0;
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

function durationLabel(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function mergeCourse(rawValue: unknown): CourseSummary {
  const raw = asRecord(rawValue);
  const learningMinutes =
    number(read(raw, "totalLearningMinutes", "total_learning_minutes")) ??
    COURSE.learningMinutes;

  return {
    title: text(read(raw, "title")) ?? COURSE.title,
    description: text(read(raw, "description")) ?? "",
    level: text(read(raw, "level")) ?? COURSE.level,
    version: text(read(raw, "version")) ?? COURSE.version,
    learningMinutes,
    learningScope:
      learningMinutes === COURSE.learningMinutes
        ? COURSE.learningScope
        : `ca. ${Math.round((learningMinutes / 60) * 10) / 10} Stunden inklusive Videos, Wissenstests und ergänzender Materialien`,
  };
}

function displayDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function displayMoney(
  amountValue: unknown,
  currencyValue: unknown,
): string | null {
  const amount = number(amountValue);
  if (amount === null) return null;
  const currency = text(currencyValue)?.toUpperCase() ?? "EUR";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
    }).format(amount / 100);
  } catch {
    return null;
  }
}

function safeUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return candidate.startsWith("/") ? candidate : null;
  }
}

function billingAddressParts(value: unknown) {
  const direct = text(value);
  if (direct) {
    return { street: direct, postalCode: "", city: "", country: "" };
  }
  const address = asRecord(value);
  return {
    street: text(read(address, "street", "line1", "street_address")) ?? "",
    postalCode: text(read(address, "postalCode", "postal_code", "zip")) ?? "",
    city: text(read(address, "city")) ?? "",
    country: text(read(address, "country", "country_code")) ?? "",
  };
}

function progressRecord(record: UnknownRecord | null): UnknownRecord | null {
  return asRecord(read(record, "progress", "lesson_progress")) ?? record;
}

function explicitStatus(record: UnknownRecord | null): LessonUiStatus | null {
  const raw = text(
    read(
      record,
      "learningStatus",
      "learning_status",
      "uiStatus",
      "ui_status",
      "status",
    ),
  )?.toLowerCase();
  if (raw === "locked" || raw === "gesperrt") return "locked";
  if (raw === "available" || raw === "verfügbar" || raw === "unlocked")
    return "available";
  if (
    raw === "in_progress" ||
    raw === "in-progress" ||
    raw === "in bearbeitung"
  ) {
    return "in_progress";
  }
  if (raw === "completed" || raw === "abgeschlossen" || raw === "passed") {
    return "completed";
  }
  return null;
}

export function mergeLessons(
  rawValue: unknown,
  accessGranted: boolean,
  bypassSequence = false,
): LessonSummary[] {
  const rawLessons = asRecords(rawValue);
  const completedByPosition: boolean[] = [];

  const sourceLessons = rawLessons.length
    ? [...rawLessons].sort(
        (left, right) =>
          (number(read(left, "position")) ?? Number.MAX_SAFE_INTEGER) -
          (number(read(right, "position")) ?? Number.MAX_SAFE_INTEGER),
      )
    : LESSONS.map((lesson) => ({ ...lesson }));

  return sourceLessons.flatMap((raw, index) => {
    const slug = text(read(raw, "slug"));
    const fallback =
      LESSONS.find((lesson) => lesson.slug === slug) ?? LESSONS[index] ?? null;
    if (!fallback && !slug) return [];

    const durationSeconds = Math.max(
      1,
      Math.round(
        number(read(raw, "durationSeconds", "duration_seconds")) ??
          fallback?.durationSeconds ??
          1,
      ),
    );
    const lesson: Lesson = {
      position:
        number(read(raw, "position")) ?? fallback?.position ?? index + 1,
      slug: slug ?? fallback?.slug ?? `lektion-${index + 1}`,
      title:
        text(read(raw, "title")) ?? fallback?.title ?? `Lektion ${index + 1}`,
      duration: durationLabel(durationSeconds),
      durationSeconds,
      summary:
        text(read(raw, "description", "summary")) ?? fallback?.summary ?? "",
      area:
        text(read(raw, "sectionTitle", "section_title", "area")) ??
        fallback?.area,
      topics: fallback?.topics ?? [],
    };
    const progress = progressRecord(raw);
    const quizPassed =
      bool(read(progress, "quizPassed", "quiz_passed")) === true;
    const legacyCompleted =
      bool(read(progress, "legacyCompleted", "legacy_completed")) === true;
    const watchedSeconds =
      number(read(progress, "watchedSeconds", "watched_seconds")) ?? 0;
    const watchedPercentValue = read(
      progress,
      "watchedPercent",
      "watched_percent",
    );
    const watchedPercent =
      watchedPercentValue === undefined
        ? boundedLearningPercent(
            (watchedSeconds / lesson.durationSeconds) * 100,
          )
        : boundedLearningPercent(watchedPercentValue);
    const priorCompleted =
      index === 0 || completedByPosition[index - 1] === true;
    const rawStatus = explicitStatus(raw);
    let status: LessonUiStatus;

    if (!accessGranted || rawLessons.length === 0) status = "locked";
    else if (rawStatus === "completed") status = "completed";
    else if (!bypassSequence && !priorCompleted) status = "locked";
    else if (rawStatus && !(bypassSequence && rawStatus === "locked"))
      status = rawStatus;
    else if (
      watchedPercent > 0 ||
      bool(read(progress, "quizStarted", "quiz_started"))
    ) {
      status = "in_progress";
    } else status = "available";

    completedByPosition[index] = status === "completed";
    return {
      ...lesson,
      id: text(read(raw, "id", "lessonId", "lesson_id")),
      status,
      watchedPercent,
      quizPassed,
      legacyCompleted,
    };
  });
}

async function authenticatedUser() {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}

async function enrollmentState(
  userId: string,
): Promise<{ granted: boolean; failed: boolean }> {
  try {
    const enrollment = await requireEnrollment(userId);
    return {
      granted:
        enrollment.status === "active" || enrollment.status === "completed",
      failed: false,
    };
  } catch (error) {
    return {
      granted: false,
      failed: !(error instanceof HttpError && error.status === 403),
    };
  }
}

export async function loadShellData(): Promise<ShellData> {
  const user = await authenticatedUser();
  const metadata = asRecord(user.user_metadata);
  const firstName = text(read(metadata, "first_name", "firstName"));
  const email = text(user.email);
  const seed = firstName ?? email ?? "Konto";

  const admin = await isAdminUser(user);

  return {
    userId: user.id,
    email,
    firstName,
    initials: seed.slice(0, 2).toUpperCase(),
    isAdmin: admin,
  };
}

export async function loadDashboard(): Promise<DashboardData> {
  const user = await authenticatedUser();
  const access = await enrollmentState(user.id);
  const metadata = asRecord(user.user_metadata);
  const fallbackName = text(read(metadata, "first_name", "firstName"));

  if (!access.granted) {
    return {
      hasAccess: false,
      loadFailed: access.failed,
      adminPreview: false,
      course: mergeCourse(null),
      firstName: fallbackName,
      completedCount: 0,
      progressPercent: 0,
      lessons: mergeLessons([], false),
      currentLesson: null,
      lastLesson: null,
      courseCompleted: false,
      certificateReady: false,
      certificateStatus: null,
    };
  }

  try {
    const raw = asRecord(await getDashboardData());
    const profile = asRecord(read(raw, "profile"));
    const course = mergeCourse(read(raw, "course"));
    const adminPreview =
      bool(read(raw, "adminPreview", "admin_preview")) === true;
    const lessons = mergeLessons(read(raw, "lessons"), true, adminPreview);
    const calculatedCompleted = lessons.filter(
      (lesson) => lesson.status === "completed",
    ).length;
    const completedCount = Math.max(
      0,
      Math.min(
        lessons.length,
        number(read(raw, "completedCount", "completed_count")) ??
          calculatedCompleted,
      ),
    );
    const progressPercent = boundedPercent(
      read(raw, "progressPercent", "progress_percent") ??
        (lessons.length ? (completedCount / lessons.length) * 100 : 0),
    );
    const currentLesson =
      lessons.find((lesson) => lesson.status === "in_progress") ??
      lessons.find((lesson) => lesson.status === "available") ??
      null;
    const lastLesson =
      [...lessons]
        .reverse()
        .find(
          (lesson) =>
            lesson.status === "in_progress" || lesson.status === "completed",
        ) ?? null;
    const courseCompleted =
      lessons.length === LESSONS.length && completedCount === LESSONS.length;
    const validCertificateAvailable =
      bool(
        read(raw, "validCertificateAvailable", "valid_certificate_available"),
      ) === true;
    const effectiveCertificate = asRecord(
      read(raw, "effectiveCertificate", "effective_certificate"),
    );
    const legacyCertificateReview = asRecord(
      read(raw, "legacyCertificateReview", "legacy_certificate_review"),
    );
    const effectiveStatus = text(read(effectiveCertificate, "status"));
    const legacyReviewStatus = text(
      read(legacyCertificateReview, "reviewStatus", "review_status"),
    );

    return {
      hasAccess: true,
      loadFailed: false,
      adminPreview,
      course,
      firstName: text(read(profile, "firstName", "first_name")) ?? fallbackName,
      completedCount,
      progressPercent,
      lessons,
      currentLesson,
      lastLesson,
      courseCompleted,
      certificateReady: validCertificateAvailable,
      certificateStatus: validCertificateAvailable
        ? "valid"
        : (effectiveStatus ??
          (legacyReviewStatus ? `legacy_${legacyReviewStatus}` : null)),
    };
  } catch {
    return {
      hasAccess: true,
      loadFailed: true,
      adminPreview: false,
      course: mergeCourse(null),
      firstName: fallbackName,
      completedCount: 0,
      progressPercent: 0,
      lessons: mergeLessons([], true),
      currentLesson: null,
      lastLesson: null,
      courseCompleted: false,
      certificateReady: false,
      certificateStatus: null,
    };
  }
}

export async function loadCourse(): Promise<DashboardData> {
  return loadDashboard();
}

export async function loadLesson(slug: string): Promise<LessonPageData> {
  const user = await authenticatedUser();
  const access = await enrollmentState(user.id);
  if (!access.granted) {
    return {
      available: false,
      loadFailed: access.failed,
      adminPreview: false,
      courseCompleted: false,
      unlocked: false,
      lesson: null,
      lessons: mergeLessons([], false),
      watchedPercent: 0,
      quizAvailable: false,
      quizPublished: false,
      materials: [],
    };
  }

  try {
    const dashboardRaw = asRecord(await getDashboardData());
    const dashboardAdminPreview =
      bool(read(dashboardRaw, "adminPreview", "admin_preview")) === true;
    const dashboardCourseCompleted =
      bool(read(dashboardRaw, "courseCompleted", "course_completed")) === true;
    const lessons = mergeLessons(
      read(dashboardRaw, "lessons"),
      true,
      dashboardAdminPreview,
    );
    const lessonFromDashboard =
      lessons.find((item) => item.slug === slug) ?? null;
    if (!lessonFromDashboard) {
      return {
        available: true,
        loadFailed: false,
        adminPreview: dashboardAdminPreview,
        courseCompleted: dashboardCourseCompleted,
        unlocked: false,
        lesson: null,
        lessons,
        watchedPercent: 0,
        quizAvailable: false,
        quizPublished: false,
        materials: [],
      };
    }

    if (lessonFromDashboard.status === "locked") {
      return {
        available: true,
        loadFailed: false,
        adminPreview: false,
        courseCompleted: dashboardCourseCompleted,
        unlocked: false,
        lesson: lessonFromDashboard,
        lessons,
        watchedPercent: lessonFromDashboard.watchedPercent,
        quizAvailable: false,
        quizPublished: false,
        materials: [],
      };
    }

    const raw = asRecord(await getLessonPageData(slug));
    const rawLesson = asRecord(read(raw, "lesson"));
    const adminPreview =
      bool(read(raw, "adminPreview", "admin_preview")) === true;
    const courseCompleted =
      bool(read(raw, "courseCompleted", "course_completed")) === true;
    const pageLessons = mergeLessons(
      read(dashboardRaw, "lessons"),
      true,
      adminPreview,
    );
    const fromList = pageLessons.find((lesson) => lesson.slug === slug) ?? null;
    if (!rawLesson || !fromList) {
      return {
        available: true,
        loadFailed: false,
        adminPreview,
        courseCompleted,
        unlocked: false,
        lesson: null,
        lessons: pageLessons,
        watchedPercent: 0,
        quizAvailable: false,
        quizPublished: false,
        materials: [],
      };
    }

    const lessonId = text(read(rawLesson, "id", "lessonId", "lesson_id"));
    let unlocked = adminPreview || courseCompleted;
    if (lessonId) {
      if (!adminPreview && !courseCompleted) {
        try {
          await assertLessonUnlocked(user.id, lessonId);
          unlocked = true;
        } catch {
          unlocked = false;
        }
      }
    }

    const progress = asRecord(read(raw, "progress"));
    const watchedSeconds =
      number(read(progress, "watchedSeconds", "watched_seconds")) ?? 0;
    const watchedPercent = boundedLearningPercent(
      read(progress, "watchedPercent", "watched_percent") ??
        (watchedSeconds / fromList.durationSeconds) * 100,
    );
    const quizPublished =
      bool(read(raw, "quizPublished", "quiz_published")) === true;
    const quizAvailable =
      !adminPreview &&
      quizPublished &&
      bool(read(raw, "quizAvailable", "quiz_available")) === true;
    const materialRecords = asRecords(
      read(rawLesson, "materials", "lesson_materials"),
    );
    const materials = materialRecords.flatMap((material) => {
      const url = safeUrl(read(material, "url", "downloadUrl", "download_url"));
      if (!url) return [];
      return [
        {
          title: text(read(material, "title", "name")) ?? "Begleitmaterial",
          url,
        },
      ];
    });

    return {
      available: true,
      loadFailed: false,
      adminPreview,
      courseCompleted,
      unlocked,
      lesson: {
        ...fromList,
        id: lessonId,
        watchedPercent,
      },
      lessons: pageLessons,
      watchedPercent,
      quizAvailable,
      quizPublished,
      materials,
    };
  } catch {
    return {
      available: true,
      loadFailed: true,
      adminPreview: false,
      courseCompleted: false,
      unlocked: false,
      lesson: null,
      lessons: mergeLessons([], true),
      watchedPercent: 0,
      quizAvailable: false,
      quizPublished: false,
      materials: [],
    };
  }
}

export async function loadCertificate(): Promise<CertificateData> {
  const user = await authenticatedUser();
  const access = await enrollmentState(user.id);
  if (!access.granted) {
    return {
      hasAccess: false,
      loadFailed: access.failed,
      completedCount: 0,
      openLessons: LESSONS.map((lesson) => lesson.title),
      courseCompleted: false,
      downloadAvailable: false,
      retryAvailable: false,
      confirmationRequired: false,
      suggestedCertificateName: "",
      confirmedCertificateName: null,
      legacyCertificateReview: null,
      certificate: null,
    };
  }

  try {
    const raw = asRecord(await getCertificateData());
    const certificate = asRecord(read(raw, "certificate"));
    const rawOpenLessons = read(raw, "openLessons", "open_lessons");
    const openLessons = Array.isArray(rawOpenLessons)
      ? rawOpenLessons
          .map((item) =>
            typeof item === "string"
              ? item
              : text(read(asRecord(item), "title")),
          )
          .filter((item): item is string => Boolean(item))
      : [];
    const statusRaw = text(read(certificate, "status"))?.toLowerCase();
    const rawCompletedCount = Array.isArray(rawOpenLessons)
      ? LESSONS.length - openLessons.length
      : (number(read(raw, "completedCount", "completed_count")) ?? 0);
    const completedCount = Math.max(
      0,
      Math.min(LESSONS.length, rawCompletedCount),
    );
    const legacyReview = asRecord(
      read(raw, "legacyCertificateReview", "legacy_certificate_review"),
    );
    const legacyReviewStatus = text(
      read(legacyReview, "reviewStatus", "review_status"),
    )?.toLowerCase();

    return {
      hasAccess: true,
      loadFailed: false,
      completedCount,
      openLessons,
      courseCompleted: completedCount === LESSONS.length,
      downloadAvailable:
        bool(read(raw, "downloadAvailable", "download_available")) === true,
      retryAvailable:
        bool(read(raw, "retryAvailable", "retry_available")) === true,
      confirmationRequired:
        bool(read(raw, "confirmationRequired", "confirmation_required")) ===
        true,
      suggestedCertificateName:
        text(
          read(raw, "suggestedCertificateName", "suggested_certificate_name"),
        ) ?? "",
      confirmedCertificateName:
        text(
          read(raw, "confirmedCertificateName", "confirmed_certificate_name"),
        ) ?? null,
      legacyCertificateReview: legacyReview
        ? {
            reportedStatus:
              text(read(legacyReview, "reportedStatus", "reported_status")) ??
              "unknown",
            reviewStatus:
              legacyReviewStatus === "pending" ||
              legacyReviewStatus === "verified" ||
              legacyReviewStatus === "rejected" ||
              legacyReviewStatus === "resolved"
                ? legacyReviewStatus
                : "unknown",
          }
        : null,
      certificate: certificate
        ? {
            fullName: text(
              read(
                certificate,
                "fullName",
                "full_name",
                "participantName",
                "participant_name",
                "certificateName",
                "certificate_name",
              ),
            ),
            number: text(
              read(
                certificate,
                "number",
                "certificateNumber",
                "certificate_number",
              ),
            ),
            issuedAt: displayDate(read(certificate, "issuedAt", "issued_at")),
            courseVersion: text(
              read(certificate, "courseVersion", "course_version"),
            ),
            status:
              statusRaw === "active"
                ? "valid"
                : statusRaw === "generating" ||
                    statusRaw === "replacing" ||
                    statusRaw === "valid" ||
                    statusRaw === "revoked" ||
                    statusRaw === "failed" ||
                    statusRaw === "archived"
                  ? statusRaw
                  : "unknown",
          }
        : null,
    };
  } catch {
    return {
      hasAccess: true,
      loadFailed: true,
      completedCount: 0,
      openLessons: [],
      courseCompleted: false,
      downloadAvailable: false,
      retryAvailable: false,
      confirmationRequired: false,
      suggestedCertificateName: "",
      confirmedCertificateName: null,
      legacyCertificateReview: null,
      certificate: null,
    };
  }
}

export async function loadProfile(): Promise<ProfileData> {
  const user = await authenticatedUser();
  const metadata = asRecord(user.user_metadata);
  const emptyProfile: ProfileData["profile"] = {
    firstName: text(read(metadata, "first_name", "firstName")) ?? "",
    lastName: text(read(metadata, "last_name", "lastName")) ?? "",
    email: text(user.email) ?? "",
    phone: "",
    certificateName: "",
    billingType: "private",
    companyName: "",
    contactPerson: "",
    billingStreet: "",
    billingPostalCode: "",
    billingCity: "",
    billingCountry: "",
    taxId: "",
  };

  try {
    const raw = asRecord(await getProfileData());
    const profile = asRecord(read(raw, "profile"));
    const orders = asRecords(read(raw, "orders")).map((order, index) => ({
      id: text(read(order, "id")) ?? `order-${index}`,
      productName: text(read(order, "productName", "product_name")),
      purchasedAt: displayDate(
        read(order, "purchasedAt", "purchased_at", "createdAt", "created_at"),
      ),
      amount:
        text(read(order, "formattedAmount", "formatted_amount")) ??
        displayMoney(
          read(order, "amountTotal", "amount_total", "amount"),
          read(order, "currency"),
        ),
      status: text(read(order, "paymentStatus", "payment_status", "status")),
      invoiceNumber: text(read(order, "invoiceNumber", "invoice_number")),
      invoiceUrl: safeUrl(
        read(
          order,
          "invoiceUrl",
          "invoice_url",
          "hostedInvoiceUrl",
          "hosted_invoice_url",
        ),
      ),
      contractConfirmationUrl: safeUrl(
        read(order, "contractConfirmationUrl", "contract_confirmation_url"),
      ),
    }));

    const billingAddress = billingAddressParts(
      read(profile, "billingAddress", "billing_address"),
    );
    const profileFirstName =
      text(read(profile, "firstName", "first_name")) ?? emptyProfile.firstName;
    const profileLastName =
      text(read(profile, "lastName", "last_name")) ?? emptyProfile.lastName;
    const defaultCertificateName = [profileFirstName, profileLastName]
      .filter(Boolean)
      .join(" ");

    return {
      loadFailed: false,
      profile: {
        firstName: profileFirstName,
        lastName: profileLastName,
        email: text(read(profile, "email")) ?? emptyProfile.email,
        phone: text(read(profile, "phone")) ?? "",
        certificateName:
          text(read(profile, "certificateName", "certificate_name")) ??
          defaultCertificateName,
        billingType: ["business", "company"].includes(
          text(read(profile, "billingType", "billing_type")) ?? "",
        )
          ? "company"
          : "private",
        companyName: text(read(profile, "companyName", "company_name")) ?? "",
        contactPerson:
          text(read(profile, "contactPerson", "contact_person")) ?? "",
        billingStreet: billingAddress.street,
        billingPostalCode: billingAddress.postalCode,
        billingCity: billingAddress.city,
        billingCountry: billingAddress.country,
        taxId: text(read(profile, "taxId", "tax_id")) ?? "",
      },
      orders,
    };
  } catch {
    return { loadFailed: true, profile: emptyProfile, orders: [] };
  }
}

export async function guardAdmin(): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
}

export async function loadAdmin(): Promise<AdminData> {
  await guardAdmin();

  const emptyCounts: AdminData["counts"] = {
    participants: null,
    activeEnrollments: null,
    completions: null,
    averageProgress: null,
    passedAttempts: null,
    failedAttempts: null,
    payments: null,
    refunds: null,
    certificates: null,
    emailErrors: null,
    openDataRequests: null,
  };

  try {
    const raw = asRecord(await getAdminOverview());
    const counts = asRecord(read(raw, "counts"));
    const recentOrders = asRecords(
      read(raw, "recentOrders", "recent_orders"),
    ).map((order, index) => ({
      id: text(read(order, "id")) ?? `order-${index}`,
      customer: text(
        read(order, "customer", "customerName", "customer_name", "email"),
      ),
      createdAt: displayDate(
        read(order, "createdAt", "created_at", "purchasedAt", "purchased_at"),
      ),
      status: text(read(order, "paymentStatus", "payment_status", "status")),
      amount:
        text(read(order, "formattedAmount", "formatted_amount")) ??
        displayMoney(
          read(order, "amountTotal", "amount_total", "amount"),
          read(order, "currency"),
        ),
    }));
    const recentEnrollments = asRecords(
      read(raw, "recentEnrollments", "recent_enrollments"),
    ).map((enrollment, index) => ({
      id: text(read(enrollment, "id")) ?? `enrollment-${index}`,
      customer: text(
        read(enrollment, "customer", "customerName", "customer_name", "email"),
      ),
      grantedAt: displayDate(
        read(enrollment, "grantedAt", "granted_at", "createdAt", "created_at"),
      ),
      status: text(read(enrollment, "status")),
      progress:
        number(read(enrollment, "progressPercent", "progress_percent")) === null
          ? null
          : boundedPercent(
              read(enrollment, "progressPercent", "progress_percent"),
            ),
    }));

    return {
      loadFailed: false,
      counts: {
        participants: number(
          read(counts, "participants", "participant_count", "users"),
        ),
        activeEnrollments: number(
          read(
            counts,
            "activeEnrollments",
            "active_enrollments",
            "enrollments",
          ),
        ),
        completions: number(read(counts, "completions", "completed_courses")),
        averageProgress: number(
          read(counts, "averageProgress", "average_progress"),
        ),
        passedAttempts: number(
          read(counts, "passedAttempts", "passed_attempts"),
        ),
        failedAttempts: number(
          read(counts, "failedAttempts", "failed_attempts"),
        ),
        payments: number(read(counts, "payments", "paid_orders", "paidOrders")),
        refunds: number(read(counts, "refunds", "refunded_orders")),
        certificates: number(
          read(counts, "certificates", "issued_certificates"),
        ),
        emailErrors: number(read(counts, "emailErrors", "email_errors")),
        openDataRequests: number(
          read(counts, "openDataRequests", "open_data_requests"),
        ),
      },
      recentOrders,
      recentEnrollments,
    };
  } catch {
    return {
      loadFailed: true,
      counts: emptyCounts,
      recentOrders: [],
      recentEnrollments: [],
    };
  }
}

export { COURSE };
