// @vitest-environment node
import { describe, expect, it } from "vitest";
import { passwordUpdateSchema } from "@/lib/validation/account";

describe("Passwortvertrag", () => {
  it("akzeptiert sichere internationale Zeichen", () => {
    expect(
      passwordUpdateSchema.safeParse({ password: "ÄpfelSindGrün9!" }).success,
    ).toBe(true);
    expect(
      passwordUpdateSchema.safeParse({ password: "İstanbulGüzel7#" }).success,
    ).toBe(true);
  });

  it("verlangt Länge, Groß-/Kleinbuchstaben, Zahl und Sonderzeichen", () => {
    for (const password of [
      "Kurz1!",
      "nurkleinbuchstaben1!",
      "NURBUCHSTABEN1!",
      "KeineZahlDabei!",
      "KeinSonderzeichen9",
    ]) {
      expect(
        passwordUpdateSchema.safeParse({ password }).success,
        password,
      ).toBe(false);
    }
  });
});
