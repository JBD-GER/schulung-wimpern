import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";

afterEach(cleanup);

describe("SiteHeader", () => {
  it("schließt das mobile Menü nach einem Navigationsklick", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile Navigation",
    });
    const mobileMenu = mobileNavigation.closest("details");

    expect(mobileMenu).not.toBeNull();
    if (!mobileMenu) return;

    mobileMenu.open = true;
    expect(mobileMenu).toHaveAttribute("open");

    await user.click(
      within(mobileNavigation).getByRole("link", { name: "Schulung" }),
    );

    expect(mobileMenu).not.toHaveAttribute("open");
  });
});
