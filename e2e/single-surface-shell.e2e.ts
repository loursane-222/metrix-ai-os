import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const directRoutes = [
  "/metrix", "/metrix/accounting", "/metrix/collections", "/metrix/company-dna", "/metrix/company",
  "/metrix/customers", "/metrix/customers/customer-1", "/metrix/customers/customer-1/edit", "/metrix/customers/new",
  "/metrix/daily-rhythm", "/metrix/documents", "/metrix/finance", "/metrix/goals", "/metrix/invoices",
  "/metrix/notifications", "/metrix/offers", "/metrix/offers/create/customer-1", "/metrix/offers/quote-1/edit",
  "/metrix/opinion", "/metrix/products", "/metrix/reports", "/metrix/sales", "/metrix/suppliers",
  "/metrix/tasks", "/metrix/tasks/new", "/metrix/team", "/metrix/templates", "/metrix/work-plan",
] as const;

async function mockEntry(page: Page, role: "OWNER" | "EMPLOYEE") {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ok: true, data: { user: { id: "user-1", phone: "+900000000000" }, session: { id: "session-1", expiresAt: "2026-08-09T00:00:00.000Z" } } } }));
  await page.route("**/api/auth/organization-context", (route) => route.fulfill({ json: { ok: true, data: { organization: { id: "org-1", name: "METRIX QA", onboardingStatus: "COMPLETED" }, membership: { id: "member-1", role } } } }));
  await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: { active: false, conversationId: null, messages: [] } } }));
}

test("every direct metrix route returns to the single conversation surface", async ({ page }) => {
  await mockEntry(page, "OWNER");
  for (const route of directRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.locator('[data-global-header="conversation"]')).toBeVisible();
    await expect(page.getByPlaceholder("Metrix ile konuş...")).toBeVisible();
  }
});

for (const role of ["OWNER", "EMPLOYEE"] as const) {
  test(`${role} customer evidence is opened from chat inside the centered frame`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockEntry(page, role);
    const customer = role === "OWNER"
      ? { id: "customer-1", displayName: "Atlas Yapı", status: "ACTIVE", balanceCents: "420000", currency: "TRY", tier: "STRATEGIC", healthScore: 91, updatedAt: "2026-08-08T10:00:00.000Z" }
      : { id: "customer-1", displayName: "Atlas Yapı", status: "ACTIVE", currency: "TRY", updatedAt: "2026-08-08T10:00:00.000Z" };
    await page.route("**/api/customers", (route) => route.fulfill({ json: { ok: true, data: { customers: [customer], count: 1 } } }));
    await page.route("**/api/ai/chat", (route) => {
      const correlationId = `field-visibility-${role.toLowerCase()}`;
      const body = [
        JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } }),
        JSON.stringify({ type: "chunk", content: "Müşteri çalışma alanını açıyorum." }),
        JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Müşteri çalışma alanını açıyorum." } }),
      ].join("\n") + "\n";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });
    await page.goto("/");
    await page.getByPlaceholder("Metrix ile konuş...").fill("Atlas Yapı müşterisini göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    const frame = page.locator('[data-workspace-frame="centered"]');
    await expect(frame).toBeVisible();
    await expect(frame.getByText("Atlas Yapı")).toBeVisible();
    if (role === "OWNER") await expect(frame.getByText("Toplam bakiye", { exact: true }).first()).toBeVisible();
    else await expect(frame.getByText("Toplam bakiye")).toHaveCount(0);
    await page.screenshot({ path: `qa-screenshots/customer-field-visibility-${role.toLowerCase()}.png`, fullPage: true });
  });
}

test("composes the renewed framed OWNER and EMPLOYEE evidence", async ({ page }) => {
  const owner = readFileSync("qa-screenshots/customer-field-visibility-owner.png").toString("base64");
  const employee = readFileSync("qa-screenshots/customer-field-visibility-employee.png").toString("base64");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#14120f;color:#ede7d9;font:700 18px system-ui}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}.label{text-align:center;padding:8px}.shot{width:100%;display:block}</style><div class="grid"><section><div class="label">OWNER · sohbetten açılan çerçeveli müşteri kartı</div><img class="shot" src="data:image/png;base64,${owner}"></section><section><div class="label">EMPLOYEE · sohbetten açılan çerçeveli müşteri kartı</div><img class="shot" src="data:image/png;base64,${employee}"></section></div>`);
  await page.screenshot({ path: "qa-screenshots/customer-field-visibility-comparison.png", fullPage: true });
});
