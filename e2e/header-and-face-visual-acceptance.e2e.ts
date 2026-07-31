import { expect, test, type Page } from "@playwright/test";

/**
 * Mocks the entry-authority gate (session/organization/brand-film) so the
 * root "/" route reaches its ready chat state without a real login — the
 * same technique the existing customer-create/navigation e2e suites use to
 * reach authenticated screens without credentials.
 */
async function mockReadyEntry(page: Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { ok: true, data: { user: { id: "u1", phone: "+900000000000" }, session: { id: "s1", expiresAt: new Date(Date.now() + 3600_000).toISOString() } } } }),
  );
  await page.route("**/api/auth/organization-context", (route) =>
    route.fulfill({ json: { ok: true, data: { organization: { id: "o1", name: "Acceptance Org", onboardingStatus: "COMPLETED" }, membership: { id: "m1", role: "OWNER" } } } }),
  );
  await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: {} } }));
}

async function assertGlobalHeader(page: Page) {
  const header = page.locator('[data-global-header="conversation"]');
  await expect(header).toBeVisible();
  await expect(header).toHaveCount(1);
  const box = await header.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box && viewport) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(4);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const history = page.getByLabel("Sohbet Geçmişi");
  const wordmark = page.locator('[data-global-wordmark="METRIX"]');
  const settings = page.getByLabel("Ayarlar");
  await expect(history).toBeVisible();
  await expect(wordmark).toBeVisible();
  await expect(settings).toBeVisible();

  const historyBox = await history.boundingBox();
  const settingsBox = await settings.boundingBox();
  const wordmarkBox = await wordmark.boundingBox();
  expect(historyBox?.width).toBeGreaterThanOrEqual(44);
  expect(historyBox?.height).toBeGreaterThanOrEqual(44);
  expect(settingsBox?.width).toBeGreaterThanOrEqual(44);
  expect(settingsBox?.height).toBeGreaterThanOrEqual(44);
  if (wordmarkBox && viewport) {
    const wordmarkCenter = wordmarkBox.x + wordmarkBox.width / 2;
    expect(Math.abs(wordmarkCenter - viewport.width / 2)).toBeLessThanOrEqual(6);
  }

  const hasBodyScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 2);
  expect(hasBodyScroll).toBe(false);
}

async function assertExecutiveFace(page: Page) {
  const face = page.locator('[data-executive-face="canonical"]');
  await expect(face).toBeVisible();
  const canvas = face.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("role", "img");
}

for (const [routeName, path] of [["root", "/"], ["metrix", "/metrix"]] as const) {
  test(`${routeName}: header and executive face are visible on mobile (390x844)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockReadyEntry(page);
    await page.goto(path);
    await assertGlobalHeader(page);
    await assertExecutiveFace(page);
    await expect(page.getByPlaceholder("Metrix ile konuş...").or(page.getByLabel("Metrix komutu"))).toBeVisible();
  });

  test(`${routeName}: header and executive face are visible on desktop (1440x900)`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockReadyEntry(page);
    await page.goto(path);
    await assertGlobalHeader(page);
    await assertExecutiveFace(page);
  });
}
