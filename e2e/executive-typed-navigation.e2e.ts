import { expect, test } from "@playwright/test";

test("client contract: applies one typed NDJSON command and preserves browser/conversation continuity", async ({ page }) => {
  let navigationEvents = 0;
  const lifecycle: Array<Record<string, unknown>> = [];
  page.on("console", (message) => {
    const match = message.text().match(/^\[BusinessNavigationClient\]\[lifecycle\] (\{.*\})$/u);
    if (match?.[1]) lifecycle.push(JSON.parse(match[1]) as Record<string, unknown>);
  });
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
  await page.getByRole("textbox", { name: "Metrix ile konuş..." }).fill("Canonical navigation fixture");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page).toHaveURL(/\/metrix\/company$/);
  expect(navigationEvents).toBe(1);
  await expect.poll(() => lifecycle.map(({ event }) => event)).toEqual(expect.arrayContaining([
    "stream_event_received",
    "dispatch_started",
    "host_command_received",
    "router_push_requested",
    "route_observed",
    "surface_claimed",
    "navigation_completed",
    "dispatch_completed",
  ]));
  expect(lifecycle.filter(({ event }) => event === "router_push_requested")).toHaveLength(1);
  expect(lifecycle.every(({ correlationId }) => correlationId === "browser-resolution")).toBe(true);
  expect(JSON.stringify(lifecycle)).not.toContain("/metrix/company");
  expect(await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"))).toBe("conversation-navigation-continuity");
  await page.goBack();
  await expect(page).toHaveURL(/\/metrix$/);
  expect(await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"))).toBe("conversation-navigation-continuity");
  await page.goForward();
  await expect(page).toHaveURL(/\/metrix\/company$/);
});
