import { expect, test } from "@playwright/test";

test("issues navigation and observes the real customer-create route and surface", async ({ page }) => {
  let createPlanRequested = false;
  await page.addInitScript(() => {
    if (typeof crypto.randomUUID !== "function") {
      Object.defineProperty(crypto, "randomUUID", { value: () => "00000000-0000-4000-8000-000000000001" });
    }
  });
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/customers/field-definitions", (route) => route.fulfill({ json: { ok: true, data: { fields: [] } } }));
  await page.route("**/api/customers/actions/create-command", async (route) => {
    createPlanRequested = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ json: { ok: false, error: { message: "Force deterministic semantic fallback in browser acceptance." } } });
  });

  await page.goto("/metrix");
  const composer = page.getByLabel("Metrix komutu").first();
  await composer.fill("Yeni müşteri kaydı açacağız.");
  await page.getByLabel("Komutu gönder").first().click();

  await expect(composer).toHaveValue("");
  await expect(page.getByText("Komut planlanıyor", { exact: true }).first()).toBeVisible();
  await expect.poll(() => createPlanRequested).toBe(true);
  await expect(page).toHaveURL(/\/metrix\/customers\/new$/);
  await expect(page.locator("#customer\\.displayName")).toBeVisible();
  await expect(page.getByText("Firma adı *", { exact: true })).toBeVisible();
});
