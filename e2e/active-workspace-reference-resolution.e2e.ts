import { expect, test } from "@playwright/test";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { projectBusinessNavigation, resolveBusinessNavigation } from "@/lib/executive-request-resolution";
import type { ActiveWorkspaceContext } from "@/lib/living-workspace";

const customer = {
  id: "customer-1", organizationId: "org-1", displayName: "Atlas Yapı", legalName: "Atlas Yapı A.Ş.", phone: null, email: null,
  balanceCents: "0", currency: "TRY", tier: null, healthScore: null, metrixNote: null, status: "ACTIVE", cariKodu: null,
  taxNumber: null, taxOffice: null, mersisNo: null, tradeRegistryNo: null, billingAddress: null, shippingAddress: null,
  eInvoiceEnabled: false, eArchiveEnabled: false, source: "MANUAL", createdByUserId: null, updatedByUserId: null,
  createdAt: "2026-08-13T10:00:00.000Z", updatedAt: "2026-08-13T10:00:00.000Z", primaryContact: null,
  commercialTerms: null, customFieldValues: [],
};

test("resolves 'bu müşteriyi düzenle' to the open customer id", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ok: true, data: { user: { id: "user-1", phone: "+900000000000" }, session: { id: "session-1", expiresAt: "2099-01-01T00:00:00.000Z" } } } }));
  await page.route("**/api/auth/organization-context", (route) => route.fulfill({ json: { ok: true, data: { organization: { id: "org-1", name: "METRIX QA", onboardingStatus: "COMPLETED" }, membership: { id: "member-1", role: "OWNER" } } } }));
  await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: { active: false, conversationId: null, messages: [] } } }));
  await page.route("**/api/customers/customer-1", (route) => route.fulfill({ json: { ok: true, data: { customer } } }));
  await page.route("**/api/customers/field-definitions", (route) => route.fulfill({ json: { ok: true, data: { fields: [] } } }));

  let chatRequestCount = 0;
  const contextualRequests: Array<Record<string, unknown>> = [];
  let resolvedRoute: string | null = null;
  await page.route("**/api/ai/chat", async (route) => {
    chatRequestCount += 1;
    const requestBody = route.request().postDataJSON() as Record<string, unknown>;
    if (chatRequestCount === 1) {
      const events = [
        { type: "navigation", command: { correlationId: "open-customer-detail", source: "written", route: "/metrix/customers/customer-1", expectedSurfaceAuthorityKey: "customers.detail.page" } },
        { type: "chunk", content: "Müşteri kaydını açıyorum." },
        { type: "done", conversationId: "workspace-reference-e2e", ai: { content: "Müşteri kaydını açıyorum." } },
      ];
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` });
      return;
    }

    contextualRequests.push(requestBody);
    const understanding: ConversationUnderstanding = {
      conversationKind: "company_related", userMotivation: "kayit_islem", companyRelevance: "high", actionExpectation: "explicit", confidence: "high",
      shouldAskClarification: false, shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning",
      businessNavigation: { operation: "NAVIGATE", domain: "customer", target: "edit", entityReference: null },
      reasoning: { summary: "Pronoun reference", observations: [], uncertainty: [], whyThisHandling: "Open record context" },
    };
    const resolution = await resolveBusinessNavigation({
      understanding,
      activeWorkspaceContext: requestBody.activeWorkspaceContext as ActiveWorkspaceContext,
      listCustomers: async () => { throw new Error("Name lookup must not run for an open-record reference."); },
    });
    expect(resolution.status).toBe("RESOLVED");
    if (resolution.status !== "RESOLVED") throw new Error("Open customer reference was not resolved.");
    const projected = projectBusinessNavigation(resolution.descriptor);
    resolvedRoute = projected.route;
    const events = [
      { type: "navigation", command: { correlationId: "edit-open-customer", source: "written", ...projected } },
      { type: "chunk", content: "Açık müşteriyi düzenlemeye geçiyorum." },
      { type: "done", conversationId: "workspace-reference-e2e", ai: { content: "Açık müşteriyi düzenlemeye geçiyorum." } },
    ];
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` });
  });

  await page.goto("http://localhost:3000/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("Atlas Yapı müşterisini aç");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByRole("region", { name: "Çalışma Alanı" })).toHaveCSS("opacity", "1");
  await expect(page.locator('input[value="Atlas Yapı"]')).toBeVisible();

  await composer.fill("bu müşteriyi düzenle");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect.poll(() => resolvedRoute).toBe("/metrix/customers/customer-1/edit");
  expect(contextualRequests[0]?.activeWorkspaceContext).toMatchObject({ domain: "customer", entityId: "customer-1", businessSurface: "customer-detail" });
  console.info("ACTIVE_WORKSPACE_REFERENCE_E2E", JSON.stringify({ entityId: "customer-1", resolvedRoute }));
});
