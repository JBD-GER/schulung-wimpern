import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParticipantsManager } from "@/components/admin/participants-manager";

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

function participant(id: string, firstName: string, status: string | null) {
  return {
    id,
    firstName,
    lastName: "Muster",
    email: `${id}@example.de`,
    enrollmentStatus: status,
    createdAt: "2026-07-21T09:00:00.000Z",
  };
}

function participantPage(
  participants: ReturnType<typeof participant>[],
  page: number,
  total: number,
) {
  return {
    participants,
    pagination: {
      page,
      pageSize: 25,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / 25),
    },
  };
}

function participantDetails(
  item: ReturnType<typeof participant>,
  enrollmentStatus: string,
) {
  return {
    participant: {
      auth_user_id: item.id,
      first_name: item.firstName,
      last_name: item.lastName,
      email: item.email,
      created_at: item.createdAt,
    },
    orders: [],
    enrollments: [
      {
        id: `enrollment-${item.id}`,
        status: enrollmentStatus,
        access_type: "purchase",
        created_at: item.createdAt,
      },
    ],
    progress: [],
    quizAttempts: [],
    certificates: [],
  };
}

function requestUrl(input: RequestInfo | URL) {
  return new URL(String(input), "https://example.test");
}

describe("Admin-Teilnehmerverwaltung", () => {
  it("macht Ergebnisse nach dem ersten 25er-Block über die Pagination erreichbar", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const page = Number(url.searchParams.get("page"));
      return page === 2
        ? json(
            participantPage(
              [participant("page-2", "Mira 26", "active")],
              2,
              26,
            ),
          )
        : json(
            participantPage([participant("page-1", "Mira 1", "active")], 1, 26),
          );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ParticipantsManager />);

    expect(await screen.findByText("Mira 1 Muster")).toBeVisible();
    expect(screen.getByText("Seite 1 von 2 · 1–25 von 26")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Nächste Seite" }));

    expect(await screen.findByText("Mira 26 Muster")).toBeVisible();
    expect(screen.getByText("Seite 2 von 2 · 26–26 von 26")).toBeVisible();
    const secondPageRequest = fetchMock.mock.calls
      .map(([input]) => requestUrl(input))
      .find((url) => url.searchParams.get("page") === "2");
    expect(secondPageRequest?.searchParams.get("pageSize")).toBe("25");
    expect(secondPageRequest?.searchParams.get("status")).toBe("all");
  });

  it("kombiniert Suche und Status und setzt die Seite bei beiden Filtern zurück", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const page = Number(url.searchParams.get("page"));
      const status = url.searchParams.get("status");
      const query = url.searchParams.get("q");
      const label = query
        ? `Gefilterte ${query}`
        : status === "active"
          ? "Aktive Auswahl"
          : `Seite ${page}`;
      const total = status === "all" ? 51 : 1;
      return json(
        participantPage(
          [participant(`${status}-${page}-${query}`, label, status)],
          page,
          total,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ParticipantsManager />);
    await screen.findByText("Seite 1 Muster");
    await user.click(screen.getByRole("button", { name: "Nächste Seite" }));
    await screen.findByText("Seite 2 Muster");

    await user.type(
      screen.getByLabelText("Name oder E-Mail-Adresse"),
      "  Mira  ",
    );
    await user.selectOptions(screen.getByLabelText("Zugangsstatus"), "active");
    expect(await screen.findByText("Gefilterte Mira Muster")).toBeVisible();

    await user.clear(screen.getByLabelText("Name oder E-Mail-Adresse"));
    await user.type(screen.getByLabelText("Name oder E-Mail-Adresse"), "Lina");
    await user.click(screen.getByRole("button", { name: "Suchen" }));
    expect(await screen.findByText("Gefilterte Lina Muster")).toBeVisible();

    await waitFor(() => {
      const statusRequest = fetchMock.mock.calls
        .map(([input]) => requestUrl(input))
        .find(
          (url) =>
            url.searchParams.get("q") === "Mira" &&
            url.searchParams.get("status") === "active",
        );
      const searchRequest = fetchMock.mock.calls
        .map(([input]) => requestUrl(input))
        .find(
          (url) =>
            url.searchParams.get("q") === "Lina" &&
            url.searchParams.get("status") === "active",
        );
      expect(statusRequest?.searchParams.get("page")).toBe("1");
      expect(searchRequest?.searchParams.get("page")).toBe("1");
      expect(searchRequest?.searchParams.get("pageSize")).toBe("25");
    });
  });

  it("bildet die erlaubten Zugangsaktionen für aktive, abgeschlossene und wartende Zugänge ab", async () => {
    const active = participant("active-user", "Anna Aktiv", "active");
    const completed = participant(
      "completed-user",
      "Clara Fertig",
      "completed",
    );
    const pending = participant(
      "pending-user",
      "Pia Wartend",
      "pending_payment",
    );
    const revoked = participant("revoked-user", "Rita Entzogen", "revoked");
    const entries = [active, completed, pending, revoked];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/admin/participants") {
        return json(participantPage(entries, 1, entries.length));
      }
      const item = entries.find(
        (entry) =>
          url.pathname ===
          `/api/admin/participants/${encodeURIComponent(entry.id)}`,
      );
      if (!item) throw new Error(`Unerwarteter Fetch: ${url.pathname}`);
      return json(participantDetails(item, item.enrollmentStatus ?? "revoked"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ParticipantsManager />);
    await screen.findByText("Anna Aktiv Muster");

    await user.click(screen.getByRole("button", { name: /Anna Aktiv Muster/ }));
    expect(
      await screen.findByRole("button", { name: "Zugang bereits aktiv" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Zugang entziehen" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: /Clara Fertig Muster/ }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Kurs bereits abgeschlossen",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Zugang entziehen" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: /Pia Wartend Muster/ }),
    );
    expect(
      await screen.findByRole("button", { name: "Zahlung noch ausstehend" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Zugang entziehen" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: /Rita Entzogen Muster/ }),
    );
    expect(
      await screen.findByRole("button", { name: "Zugang gewähren" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Zugang bereits entzogen" }),
    ).toBeDisabled();
  });

  it("zeigt Listenfehler an und lädt dieselbe Filterseite kontrolliert neu", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? json({ message: "Temporärer Listenfehler" }, 503)
        : json(
            participantPage(
              [participant("retry-user", "Nach Retry", "active")],
              1,
              1,
            ),
          );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ParticipantsManager />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporärer Listenfehler",
    );
    await user.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(await screen.findByText("Nach Retry Muster")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
