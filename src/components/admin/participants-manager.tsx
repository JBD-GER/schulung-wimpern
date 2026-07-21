"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Download,
  GraduationCap,
  LoaderCircle,
  ReceiptText,
  Search,
  ShieldOff,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/admin-state";
import { Button, buttonStyles } from "@/components/ui/button";

type Participant = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  enrollmentStatus: string | null;
  createdAt: string | null;
};

type ParticipantStatus =
  | "all"
  | "pending_payment"
  | "active"
  | "completed"
  | "revoked"
  | "refunded"
  | "disputed";

type ParticipantPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PARTICIPANTS_PAGE_SIZE = 25;

const STATUS_OPTIONS: ReadonlyArray<{
  value: ParticipantStatus;
  label: string;
}> = [
  { value: "all", label: "Alle Status" },
  { value: "pending_payment", label: "Zahlung ausstehend" },
  { value: "active", label: "Aktiv" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "revoked", label: "Entzogen" },
  { value: "refunded", label: "Erstattet" },
  { value: "disputed", label: "Zahlung angefochten" },
];

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ParticipantStatus, string>;

const REVOCABLE_STATUSES = new Set(["active", "completed", "pending_payment"]);

type ParticipantProfile = Participant & {
  certificateName: string | null;
  phone: string | null;
  billingType: string | null;
  companyName: string | null;
  contactPerson: string | null;
  billingAddress: string | null;
  taxId: string | null;
  emailVerifiedAt: string | null;
};

type Order = {
  id: string;
  amountTotal: number | null;
  currency: string | null;
  taxAmount: number | null;
  paymentStatus: string | null;
  paymentSource: string | null;
  businessPurchase: boolean | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  invoiceId: string | null;
  createdAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
};

type Enrollment = {
  id: string;
  courseId: string | null;
  status: string | null;
  accessType: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
};

type LessonProgress = {
  lessonId: string;
  watchedSeconds: number;
  videoCompleted: boolean;
  quizPassed: boolean;
  legacyCompleted: boolean;
  completedAt: string | null;
  updatedAt: string | null;
};

type QuizAttempt = {
  id: string;
  lessonId: string | null;
  score: number | null;
  passed: boolean | null;
  attemptNumber: number | null;
  startedAt: string | null;
  submittedAt: string | null;
};

type ParticipantCertificate = {
  id: string;
  number: string | null;
  participantName: string | null;
  courseVersion: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  status: string | null;
};

type LegacyCertificateReview = {
  id: string;
  paymentSource: string | null;
  sourceId: string | null;
  reportedStatus: string | null;
  reviewStatus: string | null;
  evidenceSummary: string | null;
  evidenceReference: string | null;
  reviewedAt: string | null;
  mappedCertificateId: string | null;
  createdAt: string | null;
};

type ParticipantDetails = {
  profile: ParticipantProfile;
  orders: Order[];
  enrollments: Enrollment[];
  progress: LessonProgress[];
  quizAttempts: QuizAttempt[];
  certificates: ParticipantCertificate[];
  legacyCertificateReviews: LegacyCertificateReview[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asBillingAddress(value: unknown) {
  const address = record(value);
  if (!address) return null;
  const street = asText(address.street);
  const postalCode = asText(address.postalCode ?? address.postal_code);
  const city = asText(address.city);
  const country = asText(address.country);
  const locality = [postalCode, city].filter(Boolean).join(" ");
  const lines = [street, locality || null, country].filter(Boolean);
  return lines.length ? lines.join(", ") : null;
}

function parseParticipants(value: unknown): Participant[] | null {
  const root = record(value);
  const entries = root?.participants;
  if (!Array.isArray(entries)) return null;
  return entries.flatMap((entry) => {
    const item = record(entry);
    const id = asText(item?.id ?? item?.auth_user_id);
    if (!item || !id) return [];
    return [
      {
        id,
        firstName: asText(item.firstName ?? item.first_name),
        lastName: asText(item.lastName ?? item.last_name),
        email: asText(item.email),
        enrollmentStatus: asText(
          item.enrollmentStatus ?? item.enrollment_status,
        ),
        createdAt: asText(item.createdAt ?? item.created_at),
      },
    ];
  });
}

function parseParticipantsPage(value: unknown): {
  participants: Participant[];
  pagination: ParticipantPagination;
} | null {
  const root = record(value);
  const participants = parseParticipants(value);
  const rawPagination = record(root?.pagination);
  const page = asNonNegativeInteger(rawPagination?.page);
  const pageSize = asNonNegativeInteger(rawPagination?.pageSize);
  const total = asNonNegativeInteger(rawPagination?.total);
  const totalPages = asNonNegativeInteger(rawPagination?.totalPages);

  if (
    !participants ||
    page === null ||
    page < 1 ||
    pageSize === null ||
    pageSize < 1 ||
    total === null ||
    totalPages === null ||
    participants.length > pageSize ||
    totalPages !== (total === 0 ? 0 : Math.ceil(total / pageSize))
  ) {
    return null;
  }

  return { participants, pagination: { page, pageSize, total, totalPages } };
}

function statusLabel(value: string | null) {
  return value && value in STATUS_LABELS
    ? STATUS_LABELS[value as ParticipantStatus]
    : (value ?? "Kein Zugang");
}

function accessActions(status: string | null) {
  const canRevoke = status !== null && REVOCABLE_STATUSES.has(status);
  const grantLabel =
    status === "active"
      ? "Zugang bereits aktiv"
      : status === "completed"
        ? "Kurs bereits abgeschlossen"
        : status === "pending_payment"
          ? "Zahlung noch ausstehend"
          : "Zugang gewähren";

  return {
    canGrant: !canRevoke,
    canRevoke,
    grantLabel,
    revokeLabel:
      status === "revoked"
        ? "Zugang bereits entzogen"
        : canRevoke
          ? "Zugang entziehen"
          : "Kein entziehbarer Zugang",
  };
}

function parseParticipantDetails(
  value: unknown,
  fallback: Participant,
): ParticipantDetails | null {
  const root = record(value);
  const profile = record(root?.participant);
  if (!root || !profile) return null;
  const profileId = asText(profile.auth_user_id ?? profile.id) ?? fallback.id;
  if (profileId !== fallback.id) return null;

  const parseList = <T,>(
    key: string,
    parser: (item: Record<string, unknown>) => T | null,
  ): T[] | null => {
    const values = root[key];
    if (!Array.isArray(values)) return null;
    return values.flatMap((value) => {
      const item = record(value);
      const parsed = item ? parser(item) : null;
      return parsed ? [parsed] : [];
    });
  };

  const orders = parseList("orders", (item) => {
    const id = asText(item.id);
    if (!id) return null;
    return {
      id,
      amountTotal: asNumber(item.amountTotal ?? item.amount_total),
      currency: asText(item.currency),
      taxAmount: asNumber(item.taxAmount ?? item.tax_amount),
      paymentStatus: asText(item.paymentStatus ?? item.payment_status),
      paymentSource: asText(item.paymentSource ?? item.payment_source),
      businessPurchase: asBoolean(
        item.businessPurchase ?? item.business_purchase,
      ),
      checkoutSessionId: asText(
        item.checkoutSessionId ?? item.stripe_checkout_session_id,
      ),
      paymentIntentId: asText(
        item.paymentIntentId ?? item.stripe_payment_intent_id,
      ),
      invoiceId: asText(item.invoiceId ?? item.stripe_invoice_id),
      createdAt: asText(item.createdAt ?? item.created_at),
      paidAt: asText(item.paidAt ?? item.paid_at),
      refundedAt: asText(item.refundedAt ?? item.refunded_at),
    };
  });
  const enrollments = parseList("enrollments", (item) => {
    const id = asText(item.id);
    if (!id) return null;
    return {
      id,
      courseId: asText(item.courseId ?? item.course_id),
      status: asText(item.status),
      accessType: asText(item.accessType ?? item.access_type),
      grantedAt: asText(item.grantedAt ?? item.granted_at),
      revokedAt: asText(item.revokedAt ?? item.revoked_at),
      createdAt: asText(item.createdAt ?? item.created_at),
    };
  });
  const progress = parseList("progress", (item) => {
    const lessonId = asText(item.lessonId ?? item.lesson_id);
    if (!lessonId) return null;
    return {
      lessonId,
      watchedSeconds:
        asNumber(item.watchedSeconds ?? item.watched_seconds) ?? 0,
      videoCompleted:
        asBoolean(item.videoCompleted ?? item.video_completed) ?? false,
      quizPassed: asBoolean(item.quizPassed ?? item.quiz_passed) ?? false,
      legacyCompleted:
        asBoolean(item.legacyCompleted ?? item.legacy_completed) ?? false,
      completedAt: asText(item.completedAt ?? item.completed_at),
      updatedAt: asText(item.updatedAt ?? item.updated_at),
    };
  });
  const quizAttempts = parseList("quizAttempts", (item) => {
    const id = asText(item.id);
    if (!id) return null;
    return {
      id,
      lessonId: asText(item.lessonId ?? item.lesson_id),
      score: asNumber(item.score),
      passed: asBoolean(item.passed),
      attemptNumber: asNumber(item.attemptNumber ?? item.attempt_number),
      startedAt: asText(item.startedAt ?? item.started_at),
      submittedAt: asText(item.submittedAt ?? item.submitted_at),
    };
  });
  const certificates = parseList("certificates", (item) => {
    const id = asText(item.id);
    if (!id) return null;
    return {
      id,
      number: asText(
        item.number ?? item.certificateNumber ?? item.certificate_number,
      ),
      participantName: asText(item.participantName ?? item.participant_name),
      courseVersion: asText(item.courseVersion ?? item.course_version),
      issuedAt: asText(item.issuedAt ?? item.issued_at),
      revokedAt: asText(item.revokedAt ?? item.revoked_at),
      status: asText(item.status),
    };
  });
  const parseLegacyCertificateReviews = () =>
    parseList("legacyCertificateReviews", (item) => {
      const id = asText(item.id);
      if (!id) return null;
      return {
        id,
        paymentSource: asText(item.paymentSource ?? item.payment_source),
        sourceId: asText(item.sourceId ?? item.source_id),
        reportedStatus: asText(item.reportedStatus ?? item.reported_status),
        reviewStatus: asText(item.reviewStatus ?? item.review_status),
        evidenceSummary: asText(item.evidenceSummary ?? item.evidence_summary),
        evidenceReference: asText(
          item.evidenceReference ?? item.evidence_reference,
        ),
        reviewedAt: asText(item.reviewedAt ?? item.reviewed_at),
        mappedCertificateId: asText(
          item.mappedCertificateId ?? item.mapped_certificate_id,
        ),
        createdAt: asText(item.createdAt ?? item.created_at),
      };
    });
  const legacyCertificateReviews =
    root.legacyCertificateReviews === undefined
      ? []
      : parseLegacyCertificateReviews();
  if (
    !orders ||
    !enrollments ||
    !progress ||
    !quizAttempts ||
    !certificates ||
    !legacyCertificateReviews
  )
    return null;

  return {
    profile: {
      id: profileId,
      firstName:
        asText(profile.firstName ?? profile.first_name) ?? fallback.firstName,
      lastName:
        asText(profile.lastName ?? profile.last_name) ?? fallback.lastName,
      email: asText(profile.email) ?? fallback.email,
      enrollmentStatus: enrollments[0]?.status ?? fallback.enrollmentStatus,
      createdAt:
        asText(profile.createdAt ?? profile.created_at) ?? fallback.createdAt,
      certificateName: asText(
        profile.certificateName ?? profile.certificate_name,
      ),
      phone: asText(profile.phone),
      billingType: asText(profile.billingType ?? profile.billing_type),
      companyName: asText(profile.companyName ?? profile.company_name),
      contactPerson: asText(profile.contactPerson ?? profile.contact_person),
      billingAddress: asBillingAddress(
        profile.billingAddress ?? profile.billing_address,
      ),
      taxId: asText(profile.taxId ?? profile.tax_id),
      emailVerifiedAt: asText(
        profile.emailVerifiedAt ?? profile.email_verified_at,
      ),
    },
    orders,
    enrollments,
    progress,
    quizAttempts,
    certificates,
    legacyCertificateReviews,
  };
}

function displayDate(value: string | null, withTime = false) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat(
    "de-DE",
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(date);
}

function displayMoney(value: number | null, currency: string | null) {
  if (value === null || !currency) return "–";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function participantName(
  participant: Pick<Participant, "firstName" | "lastName" | "email">,
) {
  return (
    [participant.firstName, participant.lastName].filter(Boolean).join(" ") ||
    participant.email ||
    "Name nicht verfügbar"
  );
}

function shortId(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : "–";
}

function StatePill({ value }: { value: string | null }) {
  return (
    <span className="inline-flex rounded-full bg-navy/5 px-2.5 py-1 text-xs font-bold text-muted">
      {value ?? "Nicht hinterlegt"}
    </span>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-ivory p-3">
      <dt className="text-[0.65rem] font-extrabold tracking-[0.08em] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold text-navy">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{detail}</dd>
    </div>
  );
}

export function ParticipantsManager() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState<ParticipantStatus>("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<ParticipantPagination>({
    page: 1,
    pageSize: PARTICIPANTS_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [listReload, setListReload] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ParticipantDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<
    "active" | "revoked" | null
  >(null);
  const [mutating, setMutating] = useState(false);
  const [mutationResult, setMutationResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const loadParticipants = useCallback(
    async (
      search: string,
      requestedStatus: ParticipantStatus,
      requestedPage: number,
      signal?: AbortSignal,
    ) => {
      try {
        const searchParams = new URLSearchParams({
          q: search.trim(),
          status: requestedStatus,
          page: String(requestedPage),
          pageSize: String(PARTICIPANTS_PAGE_SIZE),
        });
        const response = await fetch(
          `/api/admin/participants?${searchParams.toString()}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            record(body) && typeof record(body)?.message === "string"
              ? String(record(body)?.message)
              : "Teilnehmerdaten konnten nicht geladen werden.",
          );
        const parsed = parseParticipantsPage(body);
        if (!parsed) throw new Error("Die Teilnehmerdaten sind unvollständig.");
        if (parsed.pagination.page !== requestedPage) {
          throw new Error("Die angeforderte Teilnehmerseite ist ungültig.");
        }
        setError(null);
        setParticipants(parsed.participants);
        setPagination(parsed.pagination);
        setSelected((current) =>
          current
            ? (parsed.participants.find((item) => item.id === current.id) ??
              null)
            : null,
        );
      } catch (loadError) {
        if (signal?.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Teilnehmerdaten konnten nicht geladen werden.",
        );
        setParticipants([]);
        setPagination({
          page: requestedPage,
          pageSize: PARTICIPANTS_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () =>
        void loadParticipants(submittedQuery, status, page, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [listReload, loadParticipants, page, status, submittedQuery]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/admin/participants/${encodeURIComponent(selected.id)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        const message = record(body)?.message;
        if (!response.ok)
          throw new Error(
            typeof message === "string"
              ? message
              : "Das Teilnehmerprofil konnte nicht geladen werden.",
          );
        const parsed = parseParticipantDetails(body, selected);
        if (!parsed) throw new Error("Das Teilnehmerprofil ist unvollständig.");
        setDetails(parsed);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setDetailError(
            loadError instanceof Error
              ? loadError.message
              : "Das Teilnehmerprofil konnte nicht geladen werden.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected, detailReload]);

  const summary = useMemo(() => {
    if (!details) return null;
    const completed = details.progress.filter(
      (item) => item.videoCompleted && item.quizPassed,
    ).length;
    const passedAttempts = details.quizAttempts.filter(
      (item) => item.passed,
    ).length;
    return {
      completed,
      passedAttempts,
      latestOrder: details.orders[0] ?? null,
      currentEnrollment: details.enrollments[0] ?? null,
      currentCertificate: details.certificates[0] ?? null,
    };
  }, [details]);
  const selectedAccessActions = accessActions(
    details?.profile.enrollmentStatus ?? null,
  );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setPage(1);
    setSubmittedQuery(query.trim());
    setSelected(null);
    setDetails(null);
    setDetailError(null);
    setPendingStatus(null);
    setMutationResult(null);
    setListReload((value) => value + 1);
  }

  function changeStatusFilter(nextStatus: ParticipantStatus) {
    setLoading(true);
    setError(null);
    setStatus(nextStatus);
    setSubmittedQuery(query.trim());
    setPage(1);
    setSelected(null);
    setDetails(null);
    setDetailError(null);
    setPendingStatus(null);
    setMutationResult(null);
  }

  function changePage(nextPage: number) {
    if (
      loading ||
      nextPage < 1 ||
      (pagination.totalPages > 0 && nextPage > pagination.totalPages)
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    setPage(nextPage);
    setSelected(null);
    setDetails(null);
    setDetailError(null);
    setPendingStatus(null);
    setMutationResult(null);
  }

  async function changeAccess() {
    if (!selected || !pendingStatus) return;
    setMutating(true);
    setMutationResult(null);
    try {
      const response = await fetch(
        `/api/admin/participants/${encodeURIComponent(selected.id)}/access`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: pendingStatus }),
        },
      );
      const body = await response.json().catch(() => null);
      const message = record(body)?.message;
      if (!response.ok)
        throw new Error(
          typeof message === "string"
            ? message
            : "Der Kurszugang konnte nicht geändert werden.",
        );
      const status = pendingStatus;
      setParticipants((current) =>
        current.map((item) =>
          item.id === selected.id
            ? { ...item, enrollmentStatus: status }
            : item,
        ),
      );
      setSelected((current) =>
        current ? { ...current, enrollmentStatus: status } : null,
      );
      setPendingStatus(null);
      setDetails(null);
      setDetailError(null);
      setDetailLoading(true);
      setDetailReload((value) => value + 1);
      setMutationResult({
        ok: true,
        message:
          status === "active"
            ? "Der Kurszugang wurde gewährt und protokolliert."
            : "Der Kurszugang wurde entzogen und protokolliert.",
      });
    } catch (mutationError) {
      setPendingStatus(null);
      setMutationResult({
        ok: false,
        message:
          mutationError instanceof Error
            ? mutationError.message
            : "Der Kurszugang konnte nicht geändert werden.",
      });
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(21rem,.72fr)_minmax(0,1.28fr)]">
      <section
        className="overflow-hidden rounded-2xl border border-line bg-white shadow-card xl:self-start"
        aria-labelledby="participants-list-title"
      >
        <div className="border-b border-line p-5 sm:p-6">
          <h2
            id="participants-list-title"
            className="font-serif text-xl font-semibold text-navy"
          >
            Teilnehmerinnen suchen
          </h2>
          <form
            onSubmit={search}
            role="search"
            className="mt-4 flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row"
          >
            <label className="sr-only" htmlFor="participant-search">
              Name oder E-Mail-Adresse
            </label>
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
              />
              <input
                id="participant-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="Name oder E-Mail-Adresse"
                className="min-h-11 w-full rounded-xl border border-line bg-white pr-4 pl-10 text-sm focus:border-navy focus:outline-none"
              />
            </div>
            <Button type="submit" size="sm" disabled={loading}>
              <Search aria-hidden="true" className="size-4" />
              Suchen
            </Button>
          </form>
          <div className="mt-3">
            <label
              className="mb-1.5 block text-xs font-bold text-muted"
              htmlFor="participant-status-filter"
            >
              Zugangsstatus
            </label>
            <select
              id="participant-status-filter"
              value={status}
              disabled={loading}
              onChange={(event) =>
                changeStatusFilter(event.target.value as ParticipantStatus)
              }
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-navy focus:border-navy focus:outline-none disabled:opacity-60"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs text-muted" aria-live="polite">
            {loading
              ? "Teilnehmerliste wird aktualisiert …"
              : error
                ? "Teilnehmerliste nicht verfügbar"
                : pagination.total === 1
                  ? "1 Teilnehmerin gefunden"
                  : `${pagination.total} Teilnehmerinnen gefunden`}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          {loading ? (
            <AdminLoading label="Teilnehmerinnen werden geladen" />
          ) : error ? (
            <div className="space-y-3">
              <AdminError message={error} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setListReload((value) => value + 1);
                }}
              >
                Erneut laden
              </Button>
            </div>
          ) : participants.length === 0 ? (
            <AdminEmpty
              title="Keine Teilnehmerinnen gefunden"
              description="Für die aktuelle Suche wurden keine bestätigten Profile zurückgegeben."
            />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {participants.map((participant) => (
                <li key={participant.id}>
                  <button
                    type="button"
                    aria-pressed={selected?.id === participant.id}
                    onClick={() => {
                      setSelected(participant);
                      setDetails(null);
                      setDetailError(null);
                      setDetailLoading(true);
                      setPendingStatus(null);
                      setMutationResult(null);
                    }}
                    className={`grid min-h-16 w-full gap-2 px-4 py-3 text-left transition-colors sm:grid-cols-[1.2fr_1.3fr_.7fr_auto] sm:items-center xl:grid-cols-1 2xl:grid-cols-[1.2fr_.7fr_auto] ${selected?.id === participant.id ? "bg-[#f3ede5]" : "hover:bg-ivory"}`}
                  >
                    <span>
                      <span className="block text-sm font-bold text-navy">
                        {participantName(participant)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted 2xl:hidden">
                        {participant.email ?? "Keine E-Mail"}
                      </span>
                    </span>
                    <span className="hidden truncate text-xs text-muted sm:block xl:hidden 2xl:block">
                      {participant.email ?? "Nicht verfügbar"}
                    </span>
                    <span className="text-xs font-bold text-muted">
                      {statusLabel(participant.enrollmentStatus)}
                    </span>
                    <UserRound
                      aria-hidden="true"
                      className="hidden size-4 text-muted sm:block xl:hidden 2xl:block"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && pagination.totalPages > 1 ? (
            <nav
              className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Seitennavigation Teilnehmerinnen"
            >
              <p className="text-xs text-muted">
                Seite {pagination.page} von {pagination.totalPages} ·{" "}
                {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total,
                )}{" "}
                von {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loading || pagination.page <= 1}
                  onClick={() => changePage(pagination.page - 1)}
                >
                  Vorherige Seite
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loading || pagination.page >= pagination.totalPages}
                  onClick={() => changePage(pagination.page + 1)}
                >
                  Nächste Seite
                </Button>
              </div>
            </nav>
          ) : null}
        </div>
      </section>

      <section
        className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6"
        aria-labelledby="participant-detail-title"
      >
        {!selected ? (
          <div className="py-12 text-center">
            <UserRound
              aria-hidden="true"
              className="mx-auto size-8 text-muted/50"
            />
            <h2
              id="participant-detail-title"
              className="mt-4 font-bold text-navy"
            >
              Profil auswählen
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
              Wähle eine Teilnehmerin aus der Ergebnisliste, um Zahlung, Zugang,
              Fortschritt, Quizversuche und Zertifikate zu prüfen.
            </p>
          </div>
        ) : detailLoading ? (
          <>
            <h2 id="participant-detail-title" className="sr-only">
              Teilnehmerprofil wird geladen
            </h2>
            <AdminLoading label="Teilnehmerprofil wird geladen" />
          </>
        ) : detailError ? (
          <>
            <h2
              id="participant-detail-title"
              className="font-serif text-xl font-semibold text-navy"
            >
              {participantName(selected)}
            </h2>
            <div className="mt-5">
              <AdminError message={detailError} />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => {
                setDetails(null);
                setDetailError(null);
                setDetailLoading(true);
                setDetailReload((value) => value + 1);
              }}
            >
              Erneut laden
            </Button>
          </>
        ) : details && summary ? (
          <>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-white">
                  {(details.profile.firstName ?? details.profile.email ?? "K")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div>
                  <h2
                    id="participant-detail-title"
                    className="font-serif text-xl font-semibold text-navy"
                  >
                    {participantName(details.profile)}
                  </h2>
                  <p className="mt-1 break-all text-xs text-muted">
                    {details.profile.email ?? "E-Mail nicht verfügbar"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setPendingStatus("active")}
                  disabled={!selectedAccessActions.canGrant}
                  title={
                    selectedAccessActions.canGrant
                      ? undefined
                      : selectedAccessActions.grantLabel
                  }
                >
                  <UserCheck aria-hidden="true" className="size-4" />
                  {selectedAccessActions.grantLabel}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setPendingStatus("revoked")}
                  disabled={!selectedAccessActions.canRevoke}
                  title={
                    selectedAccessActions.canRevoke
                      ? undefined
                      : selectedAccessActions.revokeLabel
                  }
                >
                  <ShieldOff aria-hidden="true" className="size-4" />
                  {selectedAccessActions.revokeLabel}
                </Button>
              </div>
            </div>
            {mutationResult ? (
              <p
                className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5 ${mutationResult.ok ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}
                role={mutationResult.ok ? "status" : "alert"}
              >
                {mutationResult.ok ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                )}
                {mutationResult.message}
              </p>
            ) : null}

            <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Zahlung"
                value={summary.latestOrder?.paymentStatus ?? "Keine"}
                detail={
                  summary.latestOrder
                    ? displayMoney(
                        summary.latestOrder.amountTotal,
                        summary.latestOrder.currency,
                      )
                    : "Keine Bestellung"
                }
              />
              <Metric
                label="Kurszugang"
                value={summary.currentEnrollment?.status ?? "Keiner"}
                detail={
                  summary.currentEnrollment?.accessType ?? "Nicht hinterlegt"
                }
              />
              <Metric
                label="Fortschritt"
                value={`${summary.completed}/7`}
                detail="Lektionen vollständig"
              />
              <Metric
                label="Zertifikat"
                value={summary.currentCertificate?.status ?? "Keins"}
                detail={
                  summary.currentCertificate?.number ?? "Noch nicht ausgestellt"
                }
              />
            </dl>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
                  <UserRound aria-hidden="true" className="size-4" />
                  Profildaten
                </h3>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-bold text-muted">Telefon</dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.phone ?? "–"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">
                      E-Mail bestätigt
                    </dt>
                    <dd className="mt-1 text-ink">
                      {displayDate(details.profile.emailVerifiedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">
                      Zertifikatsname
                    </dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.certificateName ?? "–"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">
                      Registriert
                    </dt>
                    <dd className="mt-1 text-ink">
                      {displayDate(details.profile.createdAt)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-line p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
                  <ReceiptText aria-hidden="true" className="size-4" />
                  Rechnungskontext
                </h3>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-bold text-muted">Typ</dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.billingType === "business"
                        ? "Unternehmen"
                        : details.profile.billingType === "private"
                          ? "Privatperson"
                          : (details.profile.billingType ?? "–")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">
                      Unternehmen
                    </dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.companyName ?? "–"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-muted">
                      Ansprechperson
                    </dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.contactPerson ?? "–"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-muted">
                      Rechnungsadresse
                    </dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.billingAddress ?? "–"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-muted">
                      USt-IdNr. / Steuer-ID
                    </dt>
                    <dd className="mt-1 text-ink">
                      {details.profile.taxId ?? "–"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
                  <ReceiptText aria-hidden="true" className="size-4" />
                  Zahlungen und Bestellungen
                </h3>
                {details.orders.length ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[48rem] text-left text-sm">
                      <thead>
                        <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.08em] text-muted uppercase">
                          <th className="px-3 py-2.5">Datum</th>
                          <th className="px-3 py-2.5">Betrag</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5">Quelle</th>
                          <th className="px-3 py-2.5">Stripe-Referenzen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {details.orders.map((order) => (
                          <tr key={order.id}>
                            <td className="px-3 py-3 text-muted">
                              {displayDate(order.paidAt ?? order.createdAt)}
                            </td>
                            <td className="px-3 py-3 font-semibold text-navy">
                              {displayMoney(order.amountTotal, order.currency)}
                            </td>
                            <td className="px-3 py-3">
                              <StatePill value={order.paymentStatus} />
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {order.paymentSource ?? "–"}
                            </td>
                            <td className="px-3 py-3 font-mono text-[0.65rem] text-muted">
                              <span
                                className="block"
                                title={order.paymentIntentId ?? undefined}
                              >
                                PI: {shortId(order.paymentIntentId)}
                              </span>
                              <span
                                className="mt-1 block"
                                title={order.invoiceId ?? undefined}
                              >
                                INV: {shortId(order.invoiceId)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Keine Bestellungen hinterlegt.
                  </p>
                )}
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
                  <GraduationCap aria-hidden="true" className="size-4" />
                  Lernfortschritt
                </h3>
                {details.progress.length ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead>
                        <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.08em] text-muted uppercase">
                          <th className="px-3 py-2.5">Lektion</th>
                          <th className="px-3 py-2.5">Video</th>
                          <th className="px-3 py-2.5">Quiz</th>
                          <th className="px-3 py-2.5">Quelle</th>
                          <th className="px-3 py-2.5">Lernzeit</th>
                          <th className="px-3 py-2.5">Aktualisiert</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {details.progress.map((item) => (
                          <tr key={item.lessonId}>
                            <td
                              className="px-3 py-3 font-mono text-xs text-muted"
                              title={item.lessonId}
                            >
                              {shortId(item.lessonId)}
                            </td>
                            <td className="px-3 py-3 font-semibold text-navy">
                              {item.videoCompleted
                                ? "Abgeschlossen"
                                : item.legacyCompleted
                                  ? "Nicht nachgewiesen"
                                  : "Offen"}
                            </td>
                            <td className="px-3 py-3 font-semibold text-navy">
                              {item.quizPassed
                                ? "Bestanden"
                                : item.legacyCompleted
                                  ? "Nicht nachgewiesen"
                                  : "Offen"}
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {item.legacyCompleted
                                ? "Bestand übernommen"
                                : "Plattform"}
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {Math.floor(item.watchedSeconds / 60)} Min.
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {displayDate(item.updatedAt, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Noch kein Lernfortschritt protokolliert.
                  </p>
                )}
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  Quizversuche{" "}
                  <span className="font-normal text-muted">
                    ({summary.passedAttempts} bestanden)
                  </span>
                </h3>
                {details.quizAttempts.length ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead>
                        <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.08em] text-muted uppercase">
                          <th className="px-3 py-2.5">Zeitpunkt</th>
                          <th className="px-3 py-2.5">Lektion</th>
                          <th className="px-3 py-2.5">Versuch</th>
                          <th className="px-3 py-2.5">Ergebnis</th>
                          <th className="px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {details.quizAttempts.map((attempt) => (
                          <tr key={attempt.id}>
                            <td className="px-3 py-3 text-muted">
                              {displayDate(
                                attempt.submittedAt ?? attempt.startedAt,
                                true,
                              )}
                            </td>
                            <td
                              className="px-3 py-3 font-mono text-xs text-muted"
                              title={attempt.lessonId ?? undefined}
                            >
                              {shortId(attempt.lessonId)}
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {attempt.attemptNumber ?? "–"}
                            </td>
                            <td className="px-3 py-3 font-semibold text-navy">
                              {attempt.score === null
                                ? "Offen"
                                : `${attempt.score}/5`}
                            </td>
                            <td className="px-3 py-3">
                              <StatePill
                                value={
                                  attempt.passed === null
                                    ? "offen"
                                    : attempt.passed
                                      ? "bestanden"
                                      : "nicht bestanden"
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Noch keine Quizversuche protokolliert.
                  </p>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
                    <Award aria-hidden="true" className="size-4" />
                    Zertifikate
                  </h3>
                  <a
                    href="/admin/zertifikate"
                    className={buttonStyles({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Verwalten
                  </a>
                </div>
                {details.certificates.length ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[42rem] text-left text-sm">
                      <thead>
                        <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.08em] text-muted uppercase">
                          <th className="px-3 py-2.5">Nummer</th>
                          <th className="px-3 py-2.5">Ausgestellt</th>
                          <th className="px-3 py-2.5">Version</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5 text-right">PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {details.certificates.map((certificate) => (
                          <tr key={certificate.id}>
                            <td className="px-3 py-3 font-mono text-xs font-bold text-navy">
                              {certificate.number ?? "–"}
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {displayDate(certificate.issuedAt)}
                            </td>
                            <td className="px-3 py-3 text-muted">
                              {certificate.courseVersion ?? "–"}
                            </td>
                            <td className="px-3 py-3">
                              <StatePill value={certificate.status} />
                            </td>
                            <td className="px-3 py-3 text-right">
                              {certificate.status &&
                              ["valid", "revoked", "archived"].includes(
                                certificate.status,
                              ) ? (
                                <a
                                  href={`/api/admin/certificates/${encodeURIComponent(certificate.id)}/download`}
                                  className={buttonStyles({
                                    variant: "secondary",
                                    size: "sm",
                                  })}
                                >
                                  <Download
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                  PDF
                                </a>
                              ) : (
                                "–"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Noch kein Zertifikat hinterlegt.
                  </p>
                )}
                {details.legacyCertificateReviews.length ? (
                  <div className="mt-4 rounded-xl border border-[#d7c3a2] bg-[#f7f1e9] p-4">
                    <p className="text-xs font-extrabold tracking-[0.08em] text-[#795f35] uppercase">
                      Historische Zertifikatsverweise
                    </p>
                    <ul className="mt-3 space-y-3">
                      {details.legacyCertificateReviews.map((review) => (
                        <li
                          key={review.id}
                          className="rounded-lg border border-[#d7c3a2]/70 bg-white p-3 text-xs leading-5 text-muted"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-navy">
                              {review.paymentSource ?? "Unbekannte Quelle"} ·{" "}
                              {review.sourceId ?? "ohne Quellen-ID"}
                            </span>
                            <StatePill value={review.reviewStatus} />
                          </div>
                          <p className="mt-2">
                            Gemeldeter Status:{" "}
                            <strong>{review.reportedStatus ?? "–"}</strong>
                            {review.createdAt
                              ? ` · importiert ${displayDate(review.createdAt)}`
                              : ""}
                          </p>
                          {review.evidenceSummary ? (
                            <p className="mt-1">
                              Prüfnachweis: {review.evidenceSummary}
                            </p>
                          ) : null}
                          {review.mappedCertificateId ? (
                            <p className="mt-1 font-mono">
                              Zugeordnet: {shortId(review.mappedCertificateId)}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <a
                      href="/admin/zertifikate"
                      className="mt-3 inline-flex text-xs font-extrabold text-navy hover:underline"
                    >
                      In der Prüfwarteschlange bearbeiten
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <Dialog.Root
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open && !mutating) setPendingStatus(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={mutating}
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-muted hover:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                aria-label="Dialog schließen"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
            <span
              className={`grid size-11 place-items-center rounded-xl ${pendingStatus === "revoked" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}
            >
              {pendingStatus === "revoked" ? (
                <ShieldOff aria-hidden="true" className="size-5" />
              ) : (
                <UserCheck aria-hidden="true" className="size-5" />
              )}
            </span>
            <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
              {pendingStatus === "active"
                ? "Kurszugang wirklich gewähren?"
                : "Kurszugang wirklich entziehen?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              Die Änderung für{" "}
              {selected ? participantName(selected) : "diese Teilnehmerin"}{" "}
              wirkt unmittelbar auf geschützte Lerninhalte und wird im Audit Log
              protokolliert.
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={mutating}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button
                variant={pendingStatus === "revoked" ? "danger" : "primary"}
                onClick={() => void changeAccess()}
                disabled={mutating}
              >
                {mutating ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : pendingStatus === "revoked" ? (
                  <ShieldOff aria-hidden="true" className="size-4" />
                ) : (
                  <UserCheck aria-hidden="true" className="size-4" />
                )}
                {mutating ? "Wird gespeichert …" : "Verbindlich bestätigen"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
