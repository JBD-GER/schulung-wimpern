import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LessonCard } from "@/components/course/lesson-card";
import type { LessonSummary } from "@/components/dashboard/data";

const lesson: LessonSummary = {
  id: "lesson-1",
  position: 1,
  slug: "testlektion",
  title: "Testlektion",
  duration: "10:00",
  durationSeconds: 600,
  summary: "Kurzbeschreibung",
  topics: [],
  status: "available",
  watchedPercent: 0,
  quizPassed: false,
  legacyCompleted: false,
};

afterEach(cleanup);

describe("LessonCard", () => {
  it("zeigt bei genau 140 Zeichen keinen Mehr-lesen-Button", () => {
    const summary = "a".repeat(140);

    render(<LessonCard lesson={{ ...lesson, summary }} />);

    expect(screen.getByText(summary)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Mehr lesen/i }),
    ).not.toBeInTheDocument();
  });

  it("kürzt ab dem 141. Zeichen exakt und lässt den Text ein- und ausklappen", async () => {
    const user = userEvent.setup();
    const summary = `${"a".repeat(140)}b`;

    const { container } = render(
      <LessonCard lesson={{ ...lesson, summary }} />,
    );

    const toggle = screen.getByRole("button", {
      name: "Mehr lesen: Testlektion",
    });
    const preview = `${"a".repeat(140)}…`;

    expect(screen.getByText(preview)).toBeVisible();
    expect(screen.queryByText(summary)).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("a button")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByText(summary)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Weniger anzeigen: Testlektion",
      }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(
      screen.getByRole("button", {
        name: "Weniger anzeigen: Testlektion",
      }),
    );

    expect(screen.getByText(preview)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mehr lesen: Testlektion" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
