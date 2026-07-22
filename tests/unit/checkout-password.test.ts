// @vitest-environment node
import { compare } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashCheckoutPassword } from "@/lib/server/checkout-password";
import { checkoutPasswordSchema } from "@/lib/validation/checkout";

describe("Passwort für neue Checkout-Konten", () => {
  it("speichert einen gesalzenen Supabase-kompatiblen bcrypt-Hash", async () => {
    const password = "SicheresPasswort9!";
    const first = await hashCheckoutPassword(password);
    const second = await hashCheckoutPassword(password);

    expect(first).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain(password);
    await expect(compare(password, first)).resolves.toBe(true);
  });

  it("verwendet dieselben Stärkevorgaben wie spätere Passwortänderungen", () => {
    expect(checkoutPasswordSchema.safeParse("SicheresPasswort9!").success).toBe(
      true,
    );
    for (const password of [
      "Kurz1!",
      "nurkleinbuchstaben1!",
      "NURBUCHSTABEN1!",
      "KeineZahlDabei!",
      "KeinSonderzeichen9",
    ]) {
      expect(checkoutPasswordSchema.safeParse(password).success, password).toBe(
        false,
      );
    }
  });

  it("weist Passwörter oberhalb des bcrypt-72-Byte-Limits zurück", () => {
    expect(
      checkoutPasswordSchema.safeParse(`Äa1!${"Ä".repeat(35)}`).success,
    ).toBe(false);
  });
});
