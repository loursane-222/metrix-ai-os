import { expect, test, type Page } from "@playwright/test";

const briefing = {
  organizationId: "qa-org", briefingDate: "2026-08-06", generatedAt: "2026-08-06T08:00:00.000Z", timezone: "Europe/Istanbul",
  headline: "Bugünün yönetim özeti hazır; öncelikler ve takip başlıkları tek ekranda toplandı.", overallRiskLevel: "MEDIUM", overallConfidence: "HIGH", dataQualityNote: "Doğrulanmış yerel QA verisi.",
  topPriorities: [{ rank: 1, title: "Geciken tahsilatı netleştir", focus: "Nakit akışı", actionHint: "Atlas ile ödeme tarihini kesinleştir.", urgency: "HIGH", source: "payment" }], criticalAlerts: [], watchSignals: [],
  awarenessSummary: "Müşteri ve nakit sinyalleri güncel.", scorecardSummary: "Operasyon dengeli ilerliyor.", executiveNarrativeSummary: "Önce nakit görünürlüğünü güçlendir.", executiveFocusSummary: "Bugünün odağı tahsilat.", forecastSummary: "Kısa vadeli görünüm kontrollü.", signalTrendSummary: "Risk sinyali yatay.",
  decisionFollowUps: { openDecisions: [], overdueCommittedDecision: null, latestOutcome: null }, marketBriefing: { criticalItems: [], watchItems: [], sourceCount: 0 }, firstAction: { title: "Atlas ile görüş", reason: "Vade yaklaşıyor", actionHint: "Ödeme tarihini yazılı al.", source: "payment" }, actionOutcomeSummary: null,
};

async function mockApp(page: Page) {
  await page.route("**/api/auth/session", (r) => r.fulfill({ json: { ok: true, data: { user: { id: "qa-user", phone: "+900000000000" }, session: { id: "qa-session", expiresAt: "2026-08-07T00:00:00.000Z" } } } }));
  await page.route("**/api/auth/organization-context", (r) => r.fulfill({ json: { ok: true, data: { organization: { id: "qa-org", name: "METRIX QA", onboardingStatus: "COMPLETED" }, membership: { id: "qa-member", role: "OWNER" } } } }));
  await page.route("**/api/brand-film", (r) => r.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
  await page.route("**/api/executive/approvals", (r) => r.fulfill({ json: { ok: true, data: { approvals: [] } } }));
  await page.route("**/api/executive/lifecycle", (r) => r.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
  await page.route("**/api/first-experience", (r) => r.fulfill({ json: { ok: true, data: { authSessionId: "qa-session", dailyBrief: { conversationId: "qa-brief", content: "Günaydın. Yönetim özetiniz hazır.", briefing }, active: false, conversationId: null, messages: [] } } }));
  await page.route("**/api/customers", (r) => r.fulfill({ json: { ok: true, data: { customers: [{ id: "c1", displayName: "Arda Yapı", status: "ACTIVE", balanceCents: "125000", currency: "TRY", updatedAt: "2026-08-06T20:28:30.859Z" }, { id: "c2", displayName: "Atlas", status: "ACTIVE", balanceCents: "0", currency: "TRY", updatedAt: "2026-08-05T10:15:00.000Z" }], count: 2 } } }));
  await page.route("**/api/tasks", (r) => r.fulfill({ json: { ok: true, data: { tasks: [{ id: "t1", title: "Teklif takibini tamamla", dueDate: "2026-08-07T09:00:00.000Z", priority: "HIGH", status: "OPEN" }] } } }));
  await page.route("**/api/quotes", (r) => r.fulfill({ json: { ok: true, data: { quotes: [{ id: "q1", customerName: "Atlas", title: "Yıllık hizmet teklifi", amount: 45000, status: "SENT", updatedAt: "2026-08-06T11:30:00.000Z" }] } } }));
  await page.route("**/api/payments", (r) => r.fulfill({ json: { ok: true, data: { payments: [{ id: "p1", title: "Atlas tahsilatı", amount: 22000, currency: "TRY", status: "OVERDUE", dueDate: "2026-08-01T09:00:00.000Z" }] } } }));
}

async function openSurface(page: Page, route: string, authority: string, name: string, expectedText: string) {
  await page.route("**/api/ai/chat", async (r) => {
    const correlationId = `qa-${name}`;
    const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route, expectedSurfaceAuthorityKey: authority } }), JSON.stringify({ type: "chunk", content: `${name} çalışma alanını açıyorum.` }), JSON.stringify({ type: "done", conversationId: `qa-${name}`, ai: { content: `${name} çalışma alanını açıyorum.` } })].join("\n") + "\n";
    await r.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 1 });
  await page.getByPlaceholder("Metrix ile konuş...").fill(name);
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible();
  const frame = page.locator('[data-workspace-frame="centered"]');
  await expect(frame).toBeVisible();
  const bounds = await frame.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(200);
  expect(bounds!.y).toBeGreaterThanOrEqual(100);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1240);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(920);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa-screenshots/${name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Sohbete dön" }).click();
}

test("captures the canonical warm-platinum surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApp(page);
  await page.goto("/");
  await expect(page.getByLabel("Bugünün yönetim brifingi")).toBeVisible();
  await page.screenshot({ path: "qa-screenshots/gunluk-brifing.png", fullPage: true });
  await page.locator('[data-global-header="conversation"]').screenshot({ path: "qa-screenshots/ust-cubuk.png" });
  await openSurface(page, "/metrix/customers", "customers.list.page", "musteri-listesi", "Arda Yapı");
  await openSurface(page, "/metrix/tasks", "workspace.task.page", "gorev-listesi", "Teklif takibini tamamla");
  await openSurface(page, "/metrix/offers", "workspace.offer.page", "teklif-listesi", "Yıllık hizmet teklifi");
  await openSurface(page, "/metrix/collections", "workspace.payment.page", "tahsilat-listesi", "Atlas tahsilatı");
  await openSurface(page, "/metrix/calendar", "workspace.task.page", "takvim-ay-gorunumu", "Günlük iş programı");
});

test("keeps the conversation composer usable while a workspace is open on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page);
  await page.goto("/");
  await openSurfaceOnMobile(page, "/metrix/customers", "customers.list.page", "mobil-workspace-girdi", "Arda Yapı");
});

async function openSurfaceOnMobile(page: Page, route: string, authority: string, name: string, expectedText: string) {
  await page.route("**/api/ai/chat", async (r) => {
    const correlationId = `qa-${name}`;
    const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route, expectedSurfaceAuthorityKey: authority } }), JSON.stringify({ type: "chunk", content: "Çalışma alanını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Çalışma alanını açıyorum." } })].join("\n") + "\n";
    await r.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 1 });
  await page.getByPlaceholder("Metrix ile konuş...").fill(name);
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible();
  const composer = page.locator("[data-conversation-composer]");
  const input = composer.getByPlaceholder("Metrix ile konuş...");
  await expect(composer).toBeVisible();
  await expect(input).toBeVisible();
  await input.fill("Workspace açıkken yazılabiliyor");
  await expect(input).toHaveValue("Workspace açıkken yazılabiliyor");
  const point = await input.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return { x, y, topElementIsInput: document.elementFromPoint(x, y) === element };
  });
  expect(point.topElementIsInput).toBe(true);
  expect(point.y).toBeGreaterThan(760);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa-screenshots/${name}.png`, fullPage: true });
}
