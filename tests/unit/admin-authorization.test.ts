// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: state.maybeSingle }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { isAdminUser } from "@/lib/server/auth";

describe("rollenbasierte Admin-Autorisierung", () => {
  beforeEach(() => {
    state.maybeSingle.mockReset();
    process.env.ADMIN_EMAILS = "allowlisted@example.de";
  });

  it("gewährt ohne user_roles-Eintrag auch einer gelisteten E-Mail keinen Zugriff", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      isAdminUser({
        id: "participant-1",
        email: "allowlisted@example.de",
      } as Parameters<typeof isAdminUser>[0]),
    ).resolves.toBe(false);
  });

  it("gewährt Zugriff ausschließlich bei einer Adminrolle für die feste UID", async () => {
    state.maybeSingle.mockResolvedValue({
      data: { user_id: "admin-1" },
      error: null,
    });

    await expect(isAdminUser({ id: "admin-1" })).resolves.toBe(true);
  });
});
