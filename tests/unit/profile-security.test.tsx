import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { ProfileData } from "@/components/dashboard/data";
import { ProfileWorkspace } from "@/components/profile/profile-workspace";

const profileData: ProfileData = {
  loadFailed: false,
  profile: {
    firstName: "Mira",
    lastName: "Muster",
    email: "bisher@example.de",
    phone: "",
    certificateName: "Mira Muster",
    billingType: "private",
    companyName: "",
    contactPerson: "",
    billingStreet: "",
    billingPostalCode: "",
    billingCity: "",
    billingCountry: "DE",
    taxId: "",
  },
  orders: [],
};

const currentSession = {
  id: "current-session",
  current: true,
  userAgent: "Browser/1.0 (exakter User-Agent)",
  firstSeenAt: "2026-07-20T08:00:00.000Z",
  lastSeenAt: "2026-07-21T09:30:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Profil-Sicherheit", () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fordert für einen geänderten Zertifikatsnamen das aktuelle Passwort an", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/account/marketing-consent") {
          return jsonResponse({ granted: false });
        }
        if (url === "/api/account/update" && init?.method === "PATCH") {
          return jsonResponse({ ok: true, profile: {} });
        }
        throw new Error(`Unerwarteter Fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ProfileWorkspace data={profileData} initialSection="personal" />);

    const certificateName = screen.getByLabelText("Name auf dem Zertifikat");
    await user.clear(certificateName);
    await user.type(certificateName, "Mira Beispiel");
    const currentPassword = screen.getByLabelText(
      "Aktuelles Passwort bestätigen",
    );
    await user.type(currentPassword, "Sicheres-Passwort-123");
    await user.click(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Deine Änderungen wurden gespeichert."),
      ).toBeVisible();
    });
    const updateRequest = fetchMock.mock.calls.find(
      ([input]) => input === "/api/account/update",
    );
    expect(updateRequest).toBeDefined();
    expect(JSON.parse(String(updateRequest?.[1]?.body))).toMatchObject({
      certificateName: "Mira Beispiel",
      currentPassword: "Sicheres-Passwort-123",
    });
  });

  it("startet die E-Mail-Änderung mit aktuellem Passwort und lässt die bisherige Adresse sichtbar", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/account/marketing-consent") {
          return jsonResponse({ granted: false });
        }
        if (url === "/api/auth/sessions") {
          return jsonResponse({ sessions: [currentSession] });
        }
        if (url === "/api/auth/email-change" && init?.method === "POST") {
          return jsonResponse({
            ok: true,
            verificationRequired: true,
            message: "Bitte bestätige die versendeten Verifizierungs-E-Mails.",
          });
        }
        throw new Error(`Unerwarteter Fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ProfileWorkspace data={profileData} initialSection="security" />);

    const currentEmail = screen.getByLabelText("Bisherige E-Mail-Adresse");
    expect(currentEmail).toBeDisabled();
    expect(currentEmail).toHaveValue("bisher@example.de");

    await user.type(
      screen.getByLabelText("Neue E-Mail-Adresse"),
      "neu@example.de",
    );
    await user.type(
      screen.getByLabelText("Aktuelles Passwort"),
      "Sicheres-Passwort-123",
    );
    await user.click(
      screen.getByRole("button", { name: "Verifizierung anfordern" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Erneute Verifizierung erforderlich"),
      ).toBeVisible();
    });
    expect(currentEmail).toHaveValue("bisher@example.de");
    expect(screen.getByText(/neu@example\.de/)).toBeVisible();

    const emailRequest = fetchMock.mock.calls.find(
      ([input]) => input === "/api/auth/email-change",
    );
    expect(emailRequest).toBeDefined();
    expect(JSON.parse(String(emailRequest?.[1]?.body))).toEqual({
      email: "neu@example.de",
      currentPassword: "Sicheres-Passwort-123",
    });
  });

  it("zeigt nur echte Sitzungsdaten und lädt nach dem Abmelden anderer Sitzungen neu", async () => {
    let sessionReads = 0;
    const otherSession = {
      id: "other-session",
      current: false,
      userAgent: null,
      firstSeenAt: "2026-07-18T08:00:00.000Z",
      lastSeenAt: "2026-07-20T07:00:00.000Z",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/account/marketing-consent") {
          return jsonResponse({ granted: false });
        }
        if (url === "/api/auth/sessions") {
          sessionReads += 1;
          return jsonResponse({
            sessions:
              sessionReads === 1
                ? [currentSession, otherSession]
                : [currentSession],
          });
        }
        if (url === "/api/auth/logout-others" && init?.method === "POST") {
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unerwarteter Fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ProfileWorkspace data={profileData} initialSection="security" />);

    expect(
      await screen.findByText("Browser/1.0 (exakter User-Agent)"),
    ).toBeVisible();
    expect(screen.getByText("Nicht übermittelt")).toBeVisible();
    expect(screen.getByText("Aktuelle Sitzung")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Andere Sitzungen abmelden" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Andere aktive Sitzungen wurden abgemeldet."),
      ).toBeVisible();
    });
    expect(screen.queryByText("Nicht übermittelt")).not.toBeInTheDocument();
    expect(sessionReads).toBe(2);
    expect(
      screen.getByRole("button", { name: "Andere Sitzungen abmelden" }),
    ).toBeDisabled();
  });
});
