import { expect, test } from "@playwright/test";

test("applies one typed server navigation command and preserves browser/conversation continuity", async ({ page }) => {
  let navigationEvents = 0;
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/ai/chat", async (route) => {
    navigationEvents += 1;
    const body = [
      JSON.stringify({ type: "navigation", command: { correlationId: "browser-resolution", source: "written", route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page" } }),
      JSON.stringify({ type: "chunk", content: "Şirket çalışma yüzeyini açıyorum." }),
      JSON.stringify({ type: "done", conversationId: "conversation-navigation-continuity", ai: { content: "Şirket çalışma yüzeyini açıyorum." } }),
    ].join("\n") + "\n";
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", headers: { "X-Conversation-Id": "conversation-navigation-continuity" }, body });
  });
  await page.route("**/api/company", (route) => route.fulfill({ json: { ok: false, error: { message: "Authentication fixture intentionally unavailable." } } }));

  await page.goto("/metrix");
  await page.getByLabel("Metrix komutu").first().fill("Canonical navigation fixture");
  await page.getByLabel("Komutu gönder").first().click();
  await expect(page).toHaveURL(/\/metrix\/company$/);
  expect(navigationEvents).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"))).toBe("conversation-navigation-continuity");
  await page.goBack();
  await expect(page).toHaveURL(/\/metrix$/);
  expect(await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"))).toBe("conversation-navigation-continuity");
  await page.goForward();
  await expect(page).toHaveURL(/\/metrix\/company$/);
});
