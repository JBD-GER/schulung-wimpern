import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonQuiz } from "@/components/course/lesson-quiz";

const lessonId = "30000000-0000-4000-8000-000000000001";

let scrollIntoView: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        attemptId: "10000000-0000-4000-8000-000000000001",
        questions: Array.from({ length: 5 }, (_, questionIndex) => ({
          id: `50000000-0000-4000-8000-${String(questionIndex + 1).padStart(12, "0")}`,
          text: `Testfrage ${questionIndex + 1}`,
          options: Array.from({ length: 4 }, (_, optionIndex) => ({
            id: `60000000-0000-4000-${String(questionIndex + 1).padStart(4, "0")}-${String(optionIndex + 1).padStart(12, "0")}`,
            text: `Antwort ${optionIndex + 1}`,
          })),
        })),
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Quiz-Navigation nach bestätigtem Videofortschritt", () => {
  it("scrollt, startet den servergeschützten Versuch und fokussiert mit einem Klick die erste Frage", async () => {
    render(
      <LessonQuiz
        lessonId={lessonId}
        lessonPosition={1}
        initiallyAvailable={false}
        published
        alreadyPassed={false}
      />,
    );

    expect(screen.getByText("Wissenstest noch gesperrt")).toBeVisible();

    act(() => {
      window.dispatchEvent(new Event(`quiz-navigate:${lessonId}`));
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/quiz/${lessonId}/start`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ lessonId }),
      }),
    );
    const firstQuestion = await screen.findByText("Testfrage 1");
    await waitFor(() => expect(firstQuestion).toHaveFocus());
  });
});
