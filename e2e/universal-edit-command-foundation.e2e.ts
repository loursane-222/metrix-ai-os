import { expect, test, type Page } from "@playwright/test";

const customer = {
  id: "customer-1", organizationId: "org-1", displayName: "Atlas Yapı", legalName: "Atlas Yapı A.Ş.", phone: null, email: null,
  balanceCents: "0", currency: "TRY", tier: null, healthScore: null, metrixNote: null, status: "ACTIVE", cariKodu: null,
  taxNumber: null, taxOffice: null, mersisNo: null, tradeRegistryNo: null, billingAddress: null, shippingAddress: null,
  eInvoiceEnabled: false, eArchiveEnabled: false, source: "MANUAL", createdByUserId: null, updatedByUserId: null,
  createdAt: "2026-08-13T10:00:00.000Z", updatedAt: "2026-08-13T10:00:00.000Z", primaryContact: null,
  commercialTerms: null, customFieldValues: [],
};

const quote = {
  id: "quote-1", organizationId: "org-1", customerId: "customer-1", customerName: "Atlas Yapı", title: "Bakım Teklifi",
  amount: "0", currency: "TRY", status: "DRAFT", sentAt: null, viewedAt: null, wonAt: null, lostAt: null, notes: null,
  customerNote: null, validUntil: null, generalDiscountBasisPoints: 0, paymentTerm: null, deliveryTerm: null,
  deliveryMethod: null, metadata: null, createdAt: "2026-08-13T10:00:00.000Z", updatedAt: "2026-08-13T10:00:00.000Z", items: [],
};

async function mockShell(page: Page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ok: true, data: { user: { id: "user-1", phone: "+900000000000" }, session: { id: "session-1", expiresAt: "2099-01-01T00:00:00.000Z" } } } }));
  await page.route("**/api/auth/organization-context", (route) => route.fulfill({ json: { ok: true, data: { organization: { id: "org-1", name: "METRIX QA", onboardingStatus: "COMPLETED" }, membership: { id: "member-1", role: "OWNER" } } } }));
  await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: { active: false, conversationId: null, messages: [] } } }));
  await page.route("**/api/notifications?**", (route) => route.fulfill({ json: { ok: true, data: { notifications: [] } } }));
}

async function openSurface(page: Page, routePath: string, authority: string) {
  await page.route("**/api/ai/chat", async (route) => {
    const events = [
      { type: "navigation", command: { correlationId: "open-edit-surface", source: "written", route: routePath, expectedSurfaceAuthorityKey: authority } },
      { type: "chunk", content: "Düzenleme ekranını açıyorum." },
      { type: "done", conversationId: "universal-edit-e2e", ai: { content: "Düzenleme ekranını açıyorum." } },
    ];
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n` });
  });
  await page.goto("/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("Düzenleme ekranını aç");
  await page.getByRole("button", { name: "Gönder", exact: true }).click();
  await expect(page.getByRole("region", { name: "Çalışma Alanı" })).toHaveCSS("opacity", "1");
  return composer;
}

test("customer edit surface applies a field command through the shared foundation", async ({ page }) => {
  await mockShell(page);
  await page.route("**/api/customers/customer-1", (route) => route.fulfill({ json: { ok: true, data: { customer } } }));
  await page.route("**/api/customers/field-definitions", (route) => route.fulfill({ json: { ok: true, data: { fields: [] } } }));
  let commandRequests = 0;
  await page.route("**/api/customers/customer-1/actions/edit-command", (route) => {
    commandRequests += 1;
    return route.fulfill({ json: { ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "0532 111 22 33" } } } } } });
  });
  const composer = await openSurface(page, "/metrix/customers/customer-1/edit", "customers.edit.page");
  await expect(page.getByLabel("Telefon", { exact: true })).toBeVisible();
  await composer.fill("Telefonu 0532 111 22 33 yap");
  await page.getByRole("button", { name: "Gönder", exact: true }).click();
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("0532 111 22 33");
  expect(commandRequests).toBe(1);
});

test("offer edit surface applies a field command through the shared foundation", async ({ page }) => {
  await mockShell(page);
  await page.route("**/api/quotes/quote-1", (route) => route.fulfill({ json: { ok: true, data: { quote } } }));
  let commandRequests = 0;
  await page.route("**/api/quotes/quote-1/actions/edit-command", (route) => {
    commandRequests += 1;
    return route.fulfill({ json: { ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "set_field", field: "paymentTerm", value: "Peşin" } } } } } });
  });
  const composer = await openSurface(page, "/metrix/offers/quote-1/edit", "offers.edit.page");
  await composer.fill("Ödeme şartını peşin yap");
  await page.getByRole("button", { name: "Gönder", exact: true }).click();
  await page.getByRole("button", { name: "Şartlar" }).click({ force: true });
  await expect(page.getByLabel("Ödeme Şartı", { exact: true })).toHaveValue("Peşin");
  expect(commandRequests).toBe(1);
});
