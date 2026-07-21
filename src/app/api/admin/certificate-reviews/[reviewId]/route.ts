import { z } from "zod";

import { requireAdmin } from "@/lib/server/auth";
import { reissueVerifiedLegacyCertificate } from "@/lib/server/certificate";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const actionSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("review"),
      decision: z.enum(["verified", "rejected"]),
      reportedCourseVersion: z
        .string()
        .trim()
        .regex(/^[0-9]{4}\.[0-9]+$/)
        .optional(),
      evidenceSummary: z.string().trim().min(10).max(4000),
      evidenceReference: z.string().trim().min(3).max(1000).optional(),
    }),
    z.object({
      action: z.literal("map"),
      certificateId: z.uuid(),
    }),
    z.object({
      action: z.literal("reissue"),
      participantName: z.string().trim().min(2).max(160).optional(),
    }),
  ])
  .superRefine((input, context) => {
    if (
      input.action === "review" &&
      input.decision === "verified" &&
      !input.reportedCourseVersion
    ) {
      context.addIssue({
        code: "custom",
        path: ["reportedCourseVersion"],
        message:
          "Die belegte Kursversion ist für eine Bestätigung erforderlich.",
      });
    }
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { reviewId } = await context.params;
    const validReviewId = z.uuid().parse(reviewId);
    const input = actionSchema.parse(await readJson(request));
    const admin = getSupabaseAdmin();

    if (input.action === "review") {
      const { data, error } = await admin.rpc(
        "review_legacy_certificate_reference",
        {
          editing_admin_id: actor.id,
          target_review_id: validReviewId,
          review_decision: input.decision,
          review_reported_course_version: input.reportedCourseVersion ?? null,
          review_evidence_summary: input.evidenceSummary,
          review_evidence_reference: input.evidenceReference ?? null,
        },
      );
      if (error || data !== validReviewId) {
        throw new HttpError(
          error?.code === "22023" || error?.code === "23514" ? 409 : 503,
          "Die Nachweisprüfung konnte nicht sicher gespeichert werden.",
        );
      }
    } else if (input.action === "map") {
      const { data, error } = await admin.rpc(
        "map_legacy_certificate_reference",
        {
          editing_admin_id: actor.id,
          target_review_id: validReviewId,
          target_certificate_id: input.certificateId,
        },
      );
      if (error || data !== input.certificateId) {
        throw new HttpError(
          error?.code === "23514" || error?.code === "40001" ? 409 : 503,
          "Der historische Nachweis konnte nicht sicher zugeordnet werden.",
        );
      }
    } else {
      const result = await reissueVerifiedLegacyCertificate({
        actorId: actor.id,
        reviewId: validReviewId,
        participantName: input.participantName,
      });
      return Response.json(
        {
          ok: true,
          certificate: result.certificate,
          certificateEmailSent: result.certificateEmailSent,
        },
        { headers: noStoreHeaders() },
      );
    }

    const { data: review, error: refreshError } = await admin
      .from("legacy_certificate_reviews")
      .select(
        "id,reported_status,reported_course_version,review_status,evidence_summary,evidence_reference,reviewed_at,mapped_certificate_id,resolved_at,updated_at",
      )
      .eq("id", validReviewId)
      .single();
    if (refreshError) {
      throw new HttpError(
        503,
        "Der gespeicherte Prüfstatus kann gerade nicht geladen werden.",
      );
    }
    return Response.json({ ok: true, review }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
