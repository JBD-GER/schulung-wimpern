// @vitest-environment node
import { describe, expect, it } from "vitest";

import { progressForCourseVersion } from "@/lib/learning-progress";

const stale = {
  lesson_id: "lesson-1",
  course_version: "2025.1",
  watched_seconds: 2_600,
  video_completed: true,
  quiz_passed: true,
  legacy_completed: false,
  completed_at: "2025-01-01T00:00:00.000Z",
};

describe("versionsgebundener Lernfortschritt", () => {
  it("zeigt alte Video- und Quiz-Evidenz in einer neuen Kursversion nicht an", () => {
    expect(progressForCourseVersion(stale, "2026.1")).toBeNull();
  });

  it("bewahrt aktuelle Evidenz unverändert", () => {
    const current = { ...stale, course_version: "2026.1" };
    expect(progressForCourseVersion(current, "2026.1")).toBe(current);
  });

  it("bewahrt nur den expliziten Legacy-Marker, nicht erfundene Evidenz", () => {
    expect(
      progressForCourseVersion(
        { ...stale, course_version: null, legacy_completed: true },
        "2026.1",
      ),
    ).toMatchObject({
      course_version: null,
      watched_seconds: 0,
      video_completed: false,
      quiz_passed: false,
      legacy_completed: true,
    });
  });
});
