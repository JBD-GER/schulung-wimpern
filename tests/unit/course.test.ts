import { describe, expect, it, vi } from "vitest";
import { COURSE, LESSONS, VIDEO_MINUTES } from "@/data/course";

vi.mock("server-only", () => ({}));

import { mergeLessons } from "@/components/dashboard/data";

describe("verbindliche Kursstruktur", () => {
  it("enthält genau sieben Lektionen in fester Reihenfolge", () => {
    expect(LESSONS).toHaveLength(7);
    expect(LESSONS.map((lesson) => lesson.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(LESSONS.at(0)?.title).toBe(
      "Wimpernstylistin werden: Rechtliche Absicherung & Datenschutz",
    );
    expect(LESSONS.at(-1)?.title).toBe("Praktische Visualisierung");
  });

  it("bewahrt alle vorgegebenen Laufzeiten", () => {
    expect(LESSONS.map((lesson) => lesson.duration)).toEqual([
      "43:42",
      "45:01",
      "40:20",
      "46:34",
      "43:16",
      "43:46",
      "31:28",
    ]);
    expect(VIDEO_MINUTES).toBe(294);
    expect(COURSE.learningMinutes).toBe(420);
  });

  it("übernimmt veröffentlichte Admin-Inhalte und ihre neue Reihenfolge", () => {
    const lessons = mergeLessons(
      [
        {
          id: "lesson-b",
          slug: LESSONS[1].slug,
          position: 1,
          title: "Aktualisierter Titel",
          description: "Aktualisierte Beschreibung",
          duration_seconds: 3661,
          section_title: "Neuer Bereich",
          learningStatus: "available",
          progress: null,
        },
        {
          id: "lesson-a",
          slug: LESSONS[0].slug,
          position: 2,
          title: LESSONS[0].title,
          description: LESSONS[0].summary,
          duration_seconds: LESSONS[0].durationSeconds,
          learningStatus: "locked",
          progress: null,
        },
      ],
      true,
    );

    expect(lessons.map((lesson) => lesson.slug)).toEqual([
      LESSONS[1].slug,
      LESSONS[0].slug,
    ]);
    expect(lessons[0]).toMatchObject({
      title: "Aktualisierter Titel",
      summary: "Aktualisierte Beschreibung",
      duration: "61:01",
      area: "Neuer Bereich",
      position: 1,
      status: "available",
    });
    expect(lessons[1].status).toBe("locked");
  });

  it("verwechselt einen übernommenen Lektionsabschluss nicht mit einem bestandenen Quiz", () => {
    const lessons = mergeLessons(
      [
        {
          id: "legacy-lesson",
          slug: LESSONS[0].slug,
          position: 1,
          title: LESSONS[0].title,
          duration_seconds: LESSONS[0].durationSeconds,
          learningStatus: "completed",
          progress: {
            legacy_completed: true,
            video_completed: false,
            quiz_passed: false,
          },
        },
      ],
      true,
    );

    expect(lessons[0]).toMatchObject({
      status: "completed",
      legacyCompleted: true,
      quizPassed: false,
    });
  });

  it("öffnet in der bestätigten Admin-Vorschau die Sequenz ohne Abschlüsse zu fälschen", () => {
    const lessons = mergeLessons(
      LESSONS.slice(0, 3).map((lesson, index) => ({
        ...lesson,
        id: `lesson-${index + 1}`,
        learningStatus: index === 0 ? "available" : "locked",
        progress: null,
      })),
      true,
      true,
    );

    expect(lessons.map((lesson) => lesson.status)).toEqual([
      "available",
      "available",
      "available",
    ]);
    expect(lessons.every((lesson) => lesson.watchedPercent === 0)).toBe(true);
    expect(lessons.every((lesson) => lesson.quizPassed === false)).toBe(true);
  });
});
