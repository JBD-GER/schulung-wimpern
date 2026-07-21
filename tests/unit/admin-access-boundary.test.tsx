import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { AppShell } from "@/components/dashboard/app-shell";

const participant = {
  userId: "participant-1",
  email: "teilnehmerin@example.de",
  firstName: "Erika",
  initials: "ER",
  isAdmin: false,
};

describe("Admin-Navigation", () => {
  afterEach(cleanup);

  it("zeigt normalen Teilnehmerinnen nirgendwo einen Adminzugang", () => {
    render(<AppShell user={participant}>Kursinhalt</AppShell>);

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Administration/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/admin"]')).not.toBeInTheDocument();
  });

  it("zeigt den Zugang nur bei bestätigter serverseitiger Adminrolle", () => {
    render(
      <AppShell user={{ ...participant, isAdmin: true }}>Kursinhalt</AppShell>,
    );

    expect(
      screen.getAllByRole("link", { name: /Administration/i }),
    ).toHaveLength(2);
  });
});
