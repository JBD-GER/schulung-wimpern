import { z } from "zod";

import { requireAdmin } from "@/lib/server/auth";
import { secureStreamVideo } from "@/lib/server/cloudflare";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({
  course: z.object({
    title: z.string().trim().min(5).max(200),
    description: z.string().trim().min(10).max(5000),
    version: z
      .string()
      .regex(/^[0-9]{4}\.[0-9]+$/)
      .optional(),
    status: z.enum(["draft", "published"]),
  }),
  lessons: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().trim().min(3).max(240),
        description: z.string().trim().max(5000),
        durationSeconds: z
          .number()
          .int()
          .positive()
          .max(8 * 3600),
        streamVideoUid: z.string().trim().min(5).max(128).nullable(),
        status: z.enum(["draft", "published"]),
      }),
    )
    .length(7),
});

async function coursePayload() {
  const admin = getSupabaseAdmin();
  const { data: course, error } = await admin
    .from("courses")
    .select(
      "id,slug,title,description,level,version,status,total_learning_minutes",
    )
    .eq("slug", "online-schulung-wimpernverlaengerung")
    .single();
  if (error)
    throw new HttpError(503, "Der Kurs kann gerade nicht geladen werden.");
  if (!course) throw new HttpError(404, "Der Kurs wurde nicht gefunden.");
  const { data: lessons, error: lessonError } = await admin
    .from("lessons")
    .select(
      "id,position,slug,section_title,title,description,duration_seconds,stream_video_uid,watch_threshold,status",
    )
    .eq("course_id", course.id)
    .order("position");
  if (lessonError) throw lessonError;
  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: materials, error: materialError } = lessonIds.length
    ? await admin
        .from("lesson_materials")
        .select(
          "id,lesson_id,title,mime_type,position,status,created_at,updated_at",
        )
        .in("lesson_id", lessonIds)
        .order("position")
    : { data: [], error: null };
  if (materialError) throw materialError;
  return {
    course,
    lessons: (lessons ?? []).map((lesson) => ({
      id: lesson.id,
      position: lesson.position,
      slug: lesson.slug,
      sectionTitle: lesson.section_title,
      title: lesson.title,
      description: lesson.description,
      durationSeconds: lesson.duration_seconds,
      streamVideoUid: lesson.stream_video_uid,
      watchThreshold: lesson.watch_threshold,
      status: lesson.status,
      materials: (materials ?? [])
        .filter((material) => material.lesson_id === lesson.id)
        .map((material) => ({
          id: material.id,
          title: material.title,
          mimeType: material.mime_type,
          position: material.position,
          status: material.status,
          createdAt: material.created_at,
          updatedAt: material.updated_at,
        })),
    })),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await coursePayload(), { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = schema.parse(await readJson(request));
    const admin = getSupabaseAdmin();
    const current = await coursePayload();
    const currentIds = new Set(current.lessons.map((lesson) => lesson.id));
    if (
      new Set(input.lessons.map((lesson) => lesson.id)).size !== 7 ||
      input.lessons.some((lesson) => !currentIds.has(lesson.id))
    ) {
      throw new HttpError(
        400,
        "Die sieben bestehenden Lektionen müssen vollständig übermittelt werden.",
      );
    }
    if (
      input.course.status === "published" &&
      new Set(
        input.lessons.map((lesson) => lesson.streamVideoUid).filter(Boolean),
      ).size !== 7
    ) {
      throw new HttpError(
        400,
        "Jede veröffentlichte Lektion benötigt eine eigene Stream-Video-UID.",
      );
    }

    if (
      input.course.status === "published" &&
      input.lessons.some((lesson) => lesson.status !== "published")
    ) {
      throw new HttpError(
        409,
        "Der Kurs kann noch nicht veröffentlicht werden: Alle sieben Lektionen müssen veröffentlicht sein. Stelle den Kursstatus während der Einrichtung auf „Entwurf“.",
        "course_not_publishable",
      );
    }

    if (input.course.status === "published") {
      const { data: questions, error: questionError } = await admin
        .from("quiz_questions")
        .select("status")
        .in(
          "lesson_id",
          current.lessons.map((lesson) => lesson.id),
        );
      if (questionError) {
        throw new HttpError(
          503,
          "Die Quizfreigaben können gerade nicht geprüft werden.",
        );
      }
      const approvedQuestions = (questions ?? []).filter(
        (question) => question.status === "approved",
      ).length;
      if ((questions ?? []).length !== 35 || approvedQuestions !== 35) {
        throw new HttpError(
          409,
          `Der Kurs kann noch nicht veröffentlicht werden: ${approvedQuestions} von 35 Quizfragen sind freigegeben. Stelle den Kursstatus auf „Entwurf“, speichere zunächst die Video-UIDs und gib danach die geprüften Quizfragen frei.`,
          "course_not_publishable",
        );
      }
    }

    for (const lesson of input.lessons) {
      if (lesson.status === "published" && !lesson.streamVideoUid) {
        throw new HttpError(
          400,
          "Jede veröffentlichte Lektion benötigt eine Stream-Video-UID.",
        );
      }
      if (lesson.streamVideoUid) await secureStreamVideo(lesson.streamVideoUid);
    }

    const { error: updateError } = await admin.rpc("update_course_content", {
      editing_admin_id: actor.id,
      target_course_id: current.course.id,
      new_course_title: input.course.title,
      new_course_description: input.course.description,
      new_course_version: input.course.version ?? current.course.version,
      new_course_status: input.course.status,
      new_lessons: input.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        durationSeconds: lesson.durationSeconds,
        streamVideoUid: lesson.streamVideoUid,
        status: lesson.status,
      })),
    });
    if (updateError) {
      if (updateError.code === "23514") {
        throw new HttpError(
          409,
          "Der Kurs erfüllt noch nicht alle Voraussetzungen für die Veröffentlichung. Speichere ihn zunächst als „Entwurf“ und prüfe anschließend Videos und Quizfreigaben.",
          "course_not_publishable",
        );
      }
      if (updateError.code === "40001") {
        throw new HttpError(
          409,
          "Die Kursdaten wurden zwischenzeitlich geändert. Lade die Seite neu und prüfe deine Änderungen erneut.",
          "course_changed_concurrently",
        );
      }
      if (updateError.code === "22023") {
        throw new HttpError(
          400,
          "Mindestens eine Kurs- oder Lektionsangabe ist ungültig. Prüfe Titel, Laufzeiten, Status und Reihenfolge.",
          "invalid_course_content",
        );
      }
      throw new HttpError(
        409,
        "Der Kurs konnte nicht atomar gespeichert werden. Prüfe Videos, Quizfreigaben und Reihenfolge.",
      );
    }
    return Response.json(
      { ok: true, ...(await coursePayload()) },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
