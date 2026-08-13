import { expect, test } from "@playwright/test";

test("transports open and closed workspace context in chat requests", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ok: true, data: { user: { id: "user-1", phone: "+900000000000" }, session: { id: "session-1", expiresAt: "2099-01-01T00:00:00.000Z" } } } }));
  await page.route("**/api/auth/organization-context", (route) => route.fulfill({ json: { ok: true, data: { organization: { id: "org-1", name: "METRIX QA", onboardingStatus: "COMPLETED" }, membership: { id: "member-1", role: "OWNER" } } } }));
  await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: { active: false, conversationId: null, messages: [] } } }));
  await page.route("**/api/customers", (route) => route.fulfill({ json: { ok: true, data: { customers: [{ id: "customer-1", displayName: "Atlas Yapı", status: "ACTIVE", currency: "TRY", updatedAt: "2026-08-13T10:00:00.000Z" }], count: 1 } } }));

  const requestBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/ai/chat", async (route) => {
    const requestBody = route.request().postDataJSON() as Record<string, unknown>;
    requestBodies.push(requestBody);
    const requestIndex = requestBodies.length;
    const events = requestIndex === 1
      ? [
          { type: "navigation", command: { correlationId: "workspace-context-e2e", source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } },
          { type: "chunk", content: "Müşteri çalışma alanını açıyorum." },
          { type: "done", conversationId: "workspace-context-e2e", ai: { content: "Müşteri çalışma alanını açıyorum." } },
        ]
      : [
          { type: "chunk", content: "Bağlam alındı." },
          { type: "done", conversationId: "workspace-context-e2e", ai: { content: "Bağlam alındı." } },
        ];
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` });
  });

  await page.goto("http://localhost:3000/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("müşterileri aç");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByRole("region", { name: "Çalışma Alanı" })).toHaveCSS("opacity", "1");

  await composer.fill("bu ekranda ne var");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect.poll(() => requestBodies.length).toBe(2);
  expect(requestBodies[1]?.activeWorkspaceContext).toEqual({
    domain: "customer",
    businessSurface: "customer-list",
    entityType: "Customer",
    entityId: null,
    title: "Müşteriler",
  });

  await page.getByRole("button", { name: "Sohbete dön" }).click();
  await composer.fill("workspace kapalı");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect.poll(() => requestBodies.length).toBe(3);
  expect(requestBodies[2]?.activeWorkspaceContext).toBeNull();

  console.info("ACTIVE_WORKSPACE_CONTEXT_E2E", JSON.stringify({ open: requestBodies[1]?.activeWorkspaceContext, closed: requestBodies[2]?.activeWorkspaceContext }));
});
