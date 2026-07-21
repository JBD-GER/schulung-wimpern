import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Startseite hat eine H1 und keinen horizontalen Überlauf", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("Login ist beschriftet und noindex", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("öffentliche Seite hat keine kritischen automatischen A11y-Befunde", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    results.violations.filter((issue) => issue.impact === "critical"),
  ).toEqual([]);
});

test("Checkout und Zertifikatsprüfung bleiben mobil bedienbar und noindex", async ({
  page,
}) => {
  await page.goto("/checkout");
  await expect(
    page.getByRole("heading", { name: "Deinen Schulungsplatz buchen" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.goto("/zertifikat/pruefen");
  await expect(page.getByLabel("Zertifikatsnummer")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("geschützte Bereiche leiten ohne Sitzung sicher zum Login", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
});

test("Legacy-URLs verwenden direkte 301-Weiterleitungen", async ({
  request,
}) => {
  const response = await request.get("/registrieren", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe("/checkout");

  const protectedLegacy = await request.get("/kurs", { maxRedirects: 0 });
  expect(protectedLegacy.status()).toBe(301);
  expect(protectedLegacy.headers().location).toMatch(
    /\/login\?next=%2Fschulung$/,
  );
});

test("Sitemap enthält keine persönlichen oder administrativen Seiten", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const sitemap = await response.text();
  for (const path of [
    "/dashboard",
    "/schulung",
    "/profil",
    "/admin",
    "/checkout",
    "/zertifikat/pruefen",
  ]) {
    expect(sitemap).not.toContain(path);
  }
});
