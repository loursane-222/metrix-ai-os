import { expect, test, type Page } from "@playwright/test";

const HISTORY_ITEMS = [
  { id: "conv-1", title: "Müşteri bakiyeleri hakkında", lastMessageAt: new Date().toISOString() },
  { id: "conv-2", title: "Ürün stok analizi", lastMessageAt: new Date(Date.now() - 86_400_000).toISOString() },
];

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
  await page.route("**/api/conversations", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, data: { conversations: HISTORY_ITEMS } } });
  });
  await page.route("**/api/conversations/conv-1/messages", (route) =>
    route.fulfill({ json: { ok: true, data: { messages: [{ role: "metrix", content: "Müşteri bakiyeleri hazır." }] } } }),
  );
}

for (const [routeName, path] of [["root", "/"], ["metrix", "/metrix"]] as const) {
  for (const [viewportName, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]] as const) {
    test(`${routeName} ${viewportName}: no bottom dock, header intact, composer visible`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await mockReadyEntry(page);
      await page.goto(path);

      await expect(page.locator('[data-global-header="conversation"]')).toHaveCount(1);
      await expect(page.locator('nav[aria-label="Executive Dock"]')).toHaveCount(0);
      for (const label of ["Şirketim", "Günlük Ritim", "İş Planı", "Diğer"]) {
        await expect(page.getByText(label, { exact: true })).toHaveCount(0);
      }
      await expect(page.getByPlaceholder("Metrix ile konuş...").or(page.getByLabel("Metrix komutu"))).toHaveCount(1);

      const hasBodyScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 2);
      expect(hasBodyScroll).toBe(false);
    });

    test(`${routeName} ${viewportName}: history drawer opens from the left, dark, and closes correctly`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await mockReadyEntry(page);
      await page.goto(path);

      const historyButton = page.getByLabel("Sohbet Geçmişi");
      await historyButton.click();

      const drawer = page.getByRole("dialog", { name: "Sohbet Geçmişi" });
      await expect(drawer).toBeVisible();

      const drawerBox = await drawer.boundingBox();
      const conversation = page.locator('[data-global-header="conversation"]');
      await expect(conversation).toBeVisible();
      expect(drawerBox).not.toBeNull();
      if (drawerBox) {
        expect(drawerBox.x).toBeLessThanOrEqual(1);
        if (viewportName === "desktop") {
          expect(drawerBox.width).toBeGreaterThanOrEqual(340);
          expect(drawerBox.width).toBeLessThanOrEqual(380);
        } else {
          expect(drawerBox.width / width).toBeGreaterThanOrEqual(0.85);
          expect(drawerBox.width / width).toBeLessThanOrEqual(0.95);
        }
      }

      const bg = await drawer.evaluate((el) => getComputedStyle(el).backgroundColor);
      const [r, g, b] = bg.match(/[\d.]+/g)!.map(Number);
      expect(r).toBeLessThan(60);
      expect(g).toBeLessThan(60);
      expect(b).toBeLessThan(60);

      const newChatButtons = drawer.getByText("+ Yeni Sohbet", { exact: true });
      await expect(newChatButtons).toHaveCount(1);
      await expect(page.getByText("+ Yeni Sohbet", { exact: true })).toHaveCount(1);

      const list = drawer.locator("div.overflow-y-auto");
      await expect(list.getByText("Müşteri bakiyeleri hakkında")).toBeVisible();
      const overflowY = await list.evaluate((el) => getComputedStyle(el).overflowY);
      expect(overflowY).toBe("auto");

      // click outside closes
      await page.mouse.click(width - 20, height - 20);
      await expect(drawer).toBeHidden();

      // escape closes
      await historyButton.click();
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
    });

    test(`${routeName} ${viewportName}: selecting a past conversation and starting a new one both work from the drawer`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await mockReadyEntry(page);
      await page.goto(path);

      await page.getByLabel("Sohbet Geçmişi").click();
      const drawer = page.getByRole("dialog", { name: "Sohbet Geçmişi" });
      await drawer.getByText("Müşteri bakiyeleri hakkında").click();
      await expect(drawer).toBeHidden();
      await expect(page.getByText("Müşteri bakiyeleri hazır.")).toBeVisible();

      await page.getByLabel("Sohbet Geçmişi").click();
      await drawer.getByText("+ Yeni Sohbet", { exact: true }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByText("Müşteri bakiyeleri hazır.")).toHaveCount(0);
      // still authenticated, still on the same shell — not bounced to the login screen
      await expect(page.locator('[data-global-header="conversation"]')).toBeVisible();
    });
  }
}
