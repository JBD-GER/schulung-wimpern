import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourseManager } from "@/components/admin/course-manager";
import { QuizManager } from "@/components/admin/quiz-manager";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Admin-Kursverwaltung", () => {
  it("übermittelt Kursversion und die per Tastenschaltfläche geänderte Reihenfolge", async () => {
    const lessons = Array.from({ length: 7 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      position: index + 1,
      title: `Lektion ${index + 1}`,
      description: "Ausführliche Beschreibung",
      durationSeconds: 300,
      streamVideoUid: `stream-${index + 1}`,
      status: "draft",
      materials: [],
    }));
    let patchBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          patchBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json({
            course: {
              id: "course-1",
              title: "Online-Kurs",
              description: "Ausführliche Kursbeschreibung",
              version: "2026.2",
              status: "draft",
            },
            lessons,
          });
        }
        return json({
          course: {
            id: "course-1",
            title: "Online-Kurs",
            description: "Ausführliche Kursbeschreibung",
            version: "2026.1",
            status: "draft",
          },
          lessons,
        });
      }),
    );

    const user = userEvent.setup();
    render(<CourseManager />);
    await screen.findByRole("heading", { name: "Kurseinstellungen" });
    await user.clear(screen.getByLabelText(/Kursversion/));
    await user.type(screen.getByLabelText(/Kursversion/), "2026.2");
    await user.click(
      screen.getByRole("button", { name: "Lektion 1 nach unten verschieben" }),
    );
    await user.click(screen.getByRole("button", { name: "Änderungen prüfen" }));
    await user.click(
      screen.getByRole("button", { name: "Verbindlich speichern" }),
    );

    await waitFor(() => expect(patchBody).not.toBeNull());
    const submitted = patchBody as unknown as {
      course: { version: string };
      lessons: Array<{ id: string }>;
    };
    expect(submitted.course.version).toBe("2026.2");
    expect(submitted.lessons.map((lesson) => lesson.id).slice(0, 2)).toEqual([
      lessons[1].id,
      lessons[0].id,
    ]);
  });

  it("verhindert die Veröffentlichung einer Lektion ohne Video-UID vor dem Request", async () => {
    const lessons = Array.from({ length: 7 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      position: index + 1,
      title: `Lektion ${index + 1}`,
      description: "Ausführliche Beschreibung",
      durationSeconds: 300,
      streamVideoUid: "",
      status: "published",
      materials: [],
    }));
    let patchRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") patchRequests += 1;
        return json({
          course: {
            id: "course-1",
            title: "Online-Kurs",
            description: "Ausführliche Kursbeschreibung",
            version: "2026.1",
            status: "published",
          },
          lessons,
        });
      }),
    );

    const user = userEvent.setup();
    render(<CourseManager />);
    await screen.findByRole("heading", { name: "Kurseinstellungen" });
    await user.click(screen.getByRole("button", { name: "Änderungen prüfen" }));

    expect(
      screen.getByText(
        /Lektion 1 kann ohne Cloudflare Stream UID nicht veröffentlicht werden/,
      ),
    ).toBeVisible();
    expect(patchRequests).toBe(0);
  });

  it("zeigt einen Serverfehler direkt im geöffneten Speicherdialog", async () => {
    const lessons = Array.from({ length: 7 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      position: index + 1,
      title: `Lektion ${index + 1}`,
      description: "Ausführliche Beschreibung",
      durationSeconds: 300,
      streamVideoUid: `stream-${index + 1}`,
      status: "published",
      materials: [],
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return json(
            { message: "Der Kurs ist noch nicht veröffentlichungsbereit." },
            400,
          );
        }
        return json({
          course: {
            id: "course-1",
            title: "Online-Kurs",
            description: "Ausführliche Kursbeschreibung",
            version: "2026.1",
            status: "published",
          },
          lessons,
        });
      }),
    );

    const user = userEvent.setup();
    render(<CourseManager />);
    await screen.findByRole("heading", { name: "Kurseinstellungen" });
    await user.click(screen.getByRole("button", { name: "Änderungen prüfen" }));
    await user.click(
      screen.getByRole("button", { name: "Verbindlich speichern" }),
    );

    expect(
      await screen.findByText(
        "Der Kurs ist noch nicht veröffentlichungsbereit.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Kursänderungen speichern?" }),
    ).toBeVisible();
  });
});

describe("Admin-Quizverwaltung", () => {
  it("zeigt den abrufbaren Versionsverlauf und übernimmt die Serverversion nach dem Speichern", async () => {
    const question = {
      id: "10000000-0000-4000-8000-000000000001",
      lessonId: "20000000-0000-4000-8000-000000000001",
      lessonTitle: "Hygiene",
      lessonPosition: 1,
      position: 1,
      questionText: "Welche Aussage ist richtig?",
      editorialNote: "",
      status: "draft",
      approvedAt: null,
      version: 3,
      options: Array.from({ length: 4 }, (_, index) => ({
        id: `30000000-0000-4000-8000-00000000000${index}`,
        text: `Antwort ${index + 1}`,
        isCorrect: index === 0,
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/history"))
          return json({
            versions: [
              {
                id: "version-2",
                version: 2,
                questionText: "Frühere Frage",
                status: "draft",
                createdAt: "2026-07-01T10:00:00Z",
                options: question.options,
              },
            ],
          });
        if (init?.method === "PATCH") return json({ ok: true, version: 4 });
        return json({ questions: [question] });
      }),
    );

    const user = userEvent.setup();
    render(<QuizManager />);
    await screen.findByRole("heading", { name: "Frage bearbeiten" });
    await user.click(screen.getByRole("button", { name: "Verlauf laden" }));
    expect(await screen.findByText(/Version 2 · Entwurf/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Änderungen prüfen" }));
    await user.click(
      screen.getByRole("button", { name: "Verbindlich speichern" }),
    );
    expect(await screen.findByText("Aktuelle Version: 4")).toBeVisible();
  });
});
