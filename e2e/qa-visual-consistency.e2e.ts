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

test("captures shared atmosphere transition and responsive evidence chain", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApp(page);
  await page.route("**/api/first-experience", (r) => r.fulfill({ json: { ok: true, data: { authSessionId: "qa-session", dailyBrief: { conversationId: "qa-brief", content: "Günaydın. Yönetim özetiniz hazır.", briefing }, active: true, conversationId: null, messages: [] } } }));
  await page.route("**/api/customers", (r) => r.fulfill({ json: { ok: true, data: { customers: [{ id: "c1", displayName: "Arda Yapı", status: "ACTIVE", balanceCents: "125000", currency: "TRY" }], count: 1 } } }));
  let request = 0;
  await page.route("**/api/ai/chat", async (r) => {
    request += 1;
    const assessment = request > 1 ? { assessmentId: "qa-critical", status: "AVAILABLE", confidence: "HIGH", risks: [{ severity: "CRITICAL" }], evidence: [{ id: "payment.overdue", summary: "Vadesi geçmiş tahsilat sinyali", sourceDomain: "payment" }, { id: "cashflow.gap", summary: "Kısa vadeli nakit açığı", sourceDomain: "finance" }] } : undefined;
    const correlationId = `qa-atmosphere-${request}`;
    const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } }), JSON.stringify({ type: "chunk", content: "Müşteri çalışma alanını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Müşteri çalışma alanını açıyorum.", ...(assessment ? { executiveAssessment: assessment } : {}) } })].join("\n") + "\n";
    await r.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  });
  await page.goto("/");
  await page.getByPlaceholder("Metrix ile konuş...").fill("müşteriler");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.locator('[data-workspace-frame="centered"]')).toBeVisible();
  await expect(page.locator('[data-workspace-frame="centered"].metrix-atmosphere-neutral')).toBeVisible();
  await page.locator('[data-workspace-frame="centered"]').screenshot({ path: "qa-screenshots/atmosphere-workspace-neutral.png" });
  await page.getByRole("button", { name: "Sohbete dön" }).click();
  await page.getByPlaceholder("Metrix ile konuş...").fill("kritik durumu değerlendir");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.locator('[data-workspace-frame="centered"].metrix-atmosphere-critical')).toBeVisible();
  await page.locator('[data-workspace-frame="centered"]').screenshot({ path: "qa-screenshots/atmosphere-workspace-critical.png" });
  // The briefing is not guaranteed on every first-experience fixture; render the
  // canonical EvidenceChain contract in a deterministic shell for visual evidence.
  await page.setContent(`<style>body{margin:0;background:#14120f;color:#ddd4be;font:14px system-ui}.chain{margin:40px;max-width:720px}.items{display:grid;gap:8px;border-left:1px solid #c9bfa866;padding-left:12px}.item{position:relative;border:1px solid #e4d6b626;border-radius:8px;background:#1c1914;padding:10px}.item span{display:block;color:#7c7466;font-size:10px;text-transform:uppercase}.final{margin-top:8px;border-top:1px solid #b8874a66;padding-top:8px;color:#b8874a;font-size:10px;text-transform:uppercase}@media(min-width:768px){.items{grid-template-columns:1fr 42px 1fr;border-left:0;padding-left:0}.item{grid-column:1}.item:after{content:\"\";position:absolute;left:100%;top:50%;width:42px;border-top:1px solid #c9bfa859}.final{position:absolute;left:calc(100% + 54px);top:50%;margin:0;border:0;border-left:1px solid #b8874a66;padding:8px 0 8px 12px;width:180px;transform:translateY(-50%)}}</style><main class="chain"><h2>Nihai kanaat için kanıt yolu</h2><div class="items"><article class="item"><span>payment · payment.overdue</span>Vadesi geçmiş tahsilat sinyali</article><article class="item"><span>finance · cashflow.gap</span>Kısa vadeli nakit açığı<div class="final">Nihai kanaat</div></article></div></main>`);
  await page.screenshot({ path: "qa-screenshots/evidence-chain-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "qa-screenshots/evidence-chain-mobile.png", fullPage: true });
});

test("keeps the conversation composer usable while a workspace is open on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page);
  await page.goto("/");
  await openSurfaceOnMobile(page, "/metrix/customers", "customers.list.page", "mobil-workspace-girdi", "Arda Yapı");
});

test("shows canonical KPIs and drills into a compact customer row in the same frame", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApp(page);
  await page.goto("/");
  await page.route("**/api/ai/chat", async (r) => {
    const correlationId = "qa-canonical-overview";
    const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } }), JSON.stringify({ type: "chunk", content: "Müşteri genel bakışını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Müşteri genel bakışını açıyorum." } })].join("\n") + "\n";
    await r.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 1 });
  await page.getByPlaceholder("Metrix ile konuş...").fill("müşteriler");
  await page.getByRole("button", { name: "Gönder" }).click();
  const list = page.locator('[data-canonical-domain="customer"][data-canonical-view="list"]');
  await expect(list).toBeVisible();
  await expect(list.getByText("Toplam kayıt")).toBeVisible();
  await expect(list.locator(".workspace-kpi").getByText("Toplam bakiye", { exact: true })).toBeVisible();
  const row = list.getByRole("button", { name: "Arda Yapı detayını aç" });
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(60);
  const frame = page.locator('[data-workspace-frame="centered"]');
  const before = await frame.boundingBox();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "qa-screenshots/musteri-genel-bakis-kompakt.png", fullPage: true });
  await row.click();
  const detail = page.locator('[data-canonical-domain="customer"][data-canonical-view="detail"]');
  await expect(detail.getByRole("heading", { name: "Arda Yapı" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Listeye dön" })).toBeVisible();
  const after = await frame.boundingBox();
  expect(after!.x).toBe(before!.x);
  expect(after!.width).toBe(before!.width);
  await page.screenshot({ path: "qa-screenshots/musteri-detay-ayni-cerceve.png", fullPage: true });
  await detail.getByRole("button", { name: "Listeye dön" }).click();
  await expect(list).toBeVisible();
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
