import { expect, test } from "@playwright/test";

const customer = {
  id: "customer-1", organizationId: "org-1", displayName: "Atlas Yapı", legalName: "Atlas Yapı A.Ş.", phone: null, email: null,
  balanceCents: "0", currency: "TRY", tier: null, healthScore: null, metrixNote: null, status: "ACTIVE", cariKodu: null,
  taxNumber: null, taxOffice: null, mersisNo: null, tradeRegistryNo: null, billingAddress: null, shippingAddress: null,
  eInvoiceEnabled: false, eArchiveEnabled: false, source: "MANUAL", createdByUserId: null, updatedByUserId: null,
  createdAt: "2026-08-13T10:00:00.000Z", updatedAt: "2026-08-13T10:00:00.000Z", primaryContact: null,
  commercialTerms: null, customFieldValues: [],
};

test("routes deictic archive to the customer open in Living Workspace without changing URL", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ok: true, data: { user: { id: "user-1", phone: "+900000000000" }, session: { id: "session-1", expiresAt: "2099-01-01T00:00:00.000Z" } } } }));
  await page.route("**/api/auth/organization-context", (route) => route.fulfill({ json: { ok: true, data: { organization: { id: "org-1", name: "METRIX QA", onboardingStatus: "COMPLETED" }, membership: { id: "member-1", role: "OWNER" } } } }));
  await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: { active: false, conversationId: null, messages: [] } } }));
  await page.route("**/api/customers/customer-1", (route) => route.fulfill({ json: { ok: true, data: { customer } } }));
  await page.route("**/api/customers/field-definitions", (route) => route.fulfill({ json: { ok: true, data: { fields: [] } } }));
  await page.route("**/api/customers/customer-1/actions/edit-command", (route) => route.fulfill({ json: { ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "unsupported" } } } } }));

  const archiveTargets: string[] = [];
  await page.route("**/api/customers/*/actions/archive", async (route) => {
    const target = new URL(route.request().url()).pathname;
    archiveTargets.push(target);
    await route.fulfill({ json: { ok: true, data: { approval: { approvalId: "approval-customer-1", expiresAt: "2099-01-01T00:00:00.000Z", customerId: "customer-1" } } } });
  });

  let chatRequestCount = 0;
  await page.route("**/api/ai/chat", async (route) => {
    chatRequestCount += 1;
    const events = chatRequestCount === 1
      ? [
          { type: "navigation", command: { correlationId: "open-customer-for-mutation", source: "written", route: "/metrix/customers/customer-1", expectedSurfaceAuthorityKey: "customers.detail.page" } },
          { type: "chunk", content: "Müşteri kaydını açıyorum." },
          { type: "done", conversationId: "workspace-mutation-e2e", ai: { content: "Müşteri kaydını açıyorum." } },
        ]
      : [
          { type: "chunk", content: "Pasife alma onayını hazırladım." },
          { type: "done", conversationId: "workspace-mutation-e2e", ai: { content: "Pasife alma onayını hazırladım." } },
        ];
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` });
  });

  await page.goto("http://localhost:3000/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("Atlas Yapı müşterisini aç");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByRole("region", { name: "Çalışma Alanı" })).toHaveCSS("opacity", "1");
  await expect(page).toHaveURL("http://localhost:3000/");

  await composer.fill("bu müşteriyi pasife al");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect.poll(() => archiveTargets).toEqual(["/api/customers/customer-1/actions/archive"]);
  await expect(page).toHaveURL("http://localhost:3000/");
  console.info("ACTIVE_WORKSPACE_MUTATION_E2E", JSON.stringify({ customerId: "customer-1", archiveTarget: archiveTargets[0], browserPath: "/" }));
});
