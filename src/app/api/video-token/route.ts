export const runtime = "nodejs";

import {
  assertLessonUnlocked,
  enrollmentHasDurableCompletion,
  requireEnrollment,
} from "@/lib/server/access";
import { isAdminUser, requireUser } from "@/lib/server/auth";
import { createStreamToken, streamPlaybackUrl } from "@/lib/server/cloudflare";
import {
  HttpError,
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { videoTokenSchema } from "@/lib/validation/learning";
import { optionalEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { lessonId } = videoTokenSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "video-token",
      subject: user.id,
      maximum: 20,
      windowSeconds: 3600,
    });
    const admin = getSupabaseAdmin();
    const { data: lesson, error } = await admin
      .from("lessons")
      .select("id,course_id,stream_video_uid,status")
      .eq("id", lessonId)
      .eq("status", "published")
      .maybeSingle();
    if (error)
      throw new HttpError(503, "Das Video kann gerade nicht geladen werden.");
    if (!lesson)
      throw new HttpError(
        404,
        "Die Lektion wurde nicht gefunden.",
        "not_found",
      );
    const enrollment = await requireEnrollment(user.id, lesson.course_id);
    const adminPreview = await isAdminUser(user);
    const completedReplay =
      !adminPreview && enrollmentHasDurableCompletion(enrollment);
    if (!adminPreview && !completedReplay) {
      await assertLessonUnlocked(user.id, lesson.id);
    }
    if (!lesson.stream_video_uid) {
      throw new HttpError(
        409,
        "Das Video wird noch verarbeitet. Bitte versuche es später erneut.",
        "video_not_ready",
      );
    }

    const configuredTtl = Number(
      optionalEnv("VIDEO_TOKEN_TTL_SECONDS") ?? "4500",
    );
    if (
      !Number.isInteger(configuredTtl) ||
      configuredTtl < 3600 ||
      configuredTtl > 5400
    ) {
      throw new HttpError(
        503,
        "VIDEO_TOKEN_TTL_SECONDS muss zwischen 3600 und 5400 liegen.",
      );
    }
    const expiresAt = new Date(Date.now() + configuredTtl * 1000);
    const token = await createStreamToken(lesson.stream_video_uid, expiresAt);
    if (!adminPreview && !completedReplay) {
      const [progressResult, courseResult] = await Promise.all([
        admin
          .from("lesson_progress")
          .select("watched_seconds,course_version")
          .eq("user_id", user.id)
          .eq("lesson_id", lesson.id)
          .maybeSingle(),
        admin
          .from("courses")
          .select("version")
          .eq("id", lesson.course_id)
          .single(),
      ]);
      if (progressResult.error || courseResult.error || !courseResult.data)
        throw new HttpError(
          503,
          "Der Videofortschritt kann gerade nicht geladen werden.",
        );
      const progress = progressResult.data;
      const courseVersion = courseResult.data.version;
      const { error: sessionError } = await admin
        .from("video_access_sessions")
        .insert({
          user_id: user.id,
          lesson_id: lesson.id,
          course_version: courseVersion,
          expires_at: expiresAt.toISOString(),
          watched_seconds_at_start:
            progress?.course_version === courseVersion
              ? (progress?.watched_seconds ?? 0)
              : 0,
        });
      if (sessionError)
        throw new HttpError(
          503,
          "Die Videositzung konnte nicht gestartet werden.",
        );
    }

    return Response.json(
      {
        playbackUrl: streamPlaybackUrl(token),
        expiresAt: expiresAt.toISOString(),
        previewMode: adminPreview,
        replayMode: completedReplay,
      },
      { headers: noStoreHeaders({ Vary: "Cookie" }) },
    );
  } catch (error) {
    return jsonError(error);
  }
}
