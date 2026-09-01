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

test("keeps a server-backed pending approval visible across workspace changes", async ({ page }) => {
  await mockEntry(page, "OWNER");
  const approval = {
    envelopeId: "approval:pending-1:PENDING",
    source: "approval",
    phase: "awaiting_decision",
    status: "waiting",
    timestamp: Date.now(),
    correlationId: "pending-1",
    sessionId: "pending-1",
    summary: "payment.apply için onay bekleniyor",
    recoverability: "user_action",
    approval: { approvalId: "pending-1", actionName: "payment.apply", expiresAt: "2099-01-01T00:00:00.000Z", currentStatus: "PENDING" },
  };
  await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [approval] } } }));
  await page.route("**/api/customers", (route) => route.fulfill({ json: { ok: true, data: { customers: [], count: 0 } } }));
  await page.route("**/api/ai/chat", (route) => {
    const body = [
      JSON.stringify({ type: "navigation", command: { correlationId: "pending-navigation", source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } }),
      JSON.stringify({ type: "chunk", content: "Müşterileri açıyorum." }),
      JSON.stringify({ type: "done", conversationId: "pending-navigation", ai: { content: "Müşterileri açıyorum." } }),
    ].join("\n") + "\n";
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 1 });
  await page.goto("/");
  await expect(page.getByText("payment.apply için onay bekleniyor", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Metrix ile konuş...").fill("müşteriler");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByRole("heading", { name: "Müşteriler" }).last()).toBeVisible();
  await expect(page.getByText("payment.apply için onay bekleniyor", { exact: true })).toBeVisible();
  await page.screenshot({ path: "qa-screenshots/pending-work-survives-workspace-change.png", fullPage: true });
});

test("collection recommendations share one bounded, scrollable canonical Workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await mockEntry(page, "OWNER");
  const payments = Array.from({ length: 9 }, (_, index) => ({
    id: `payment-${index + 1}`, title: `Tahsilat ${index + 1}`, amount: 10_000 + index,
    currency: "TRY", status: index % 2 ? "PARTIAL" : "OVERDUE",
    dueDate: "2026-08-01T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z",
  }));
  const collectionActions = Array.from({ length: 8 }, (_, index) => ({
    id: `action-${index + 1}`, actionType: "FOLLOW_UP", status: "OPEN",
    title: `Takip ${index + 1}`, aiReason: "Vadesi geçen tahsilat için takip önerisi.", priority: index + 1,
    createdAt: "2026-08-01T00:00:00.000Z", payment: { title: `Tahsilat ${index + 1}`, person: { fullName: `Müşteri ${index + 1}` } },
  }));
  await page.route("**/api/payments", (route) => route.fulfill({ json: { ok: true, data: { payments, count: payments.length } } }));
  await page.route("**/api/collection-actions", (route) => route.fulfill({ json: { ok: true, data: { collectionActions, count: collectionActions.length } } }));
  await page.route("**/api/ai/chat", (route) => {
    const correlationId = "collection-single-workspace";
    const financialAnswer = "Bu ay net tahsilat geçen aya göre 4.000 TL daha yüksek.";
    const body = [
      JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/collections", expectedSurfaceAuthorityKey: "collections.list.page" } }),
      JSON.stringify({ type: "chunk", content: financialAnswer }),
      JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: financialAnswer } }),
    ].join("\n") + "\n";
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 1 });

  await page.goto("/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("Bu ay geçen aya göre tahsilatlar nasıl?");
  await page.getByRole("button", { name: "Gönder" }).click();

  const workspace = page.locator('[data-executive-target="living-workspace"]:visible');
  await expect(workspace).toHaveCount(1);
  await expect(page.locator("[data-approved-domain-workspace]:visible")).toHaveCount(1);
  await expect(page.locator(".workspace-surface:visible")).toHaveCount(0);
  await expect(page.locator("[data-collection-recommendations]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tamamlandı" }).first()).toBeVisible();
  await expect(page.getByText("Bu ay net tahsilat geçen aya göre 4.000 TL daha yüksek.", { exact: true })).toHaveCount(1);
  await expect(page.getByText("İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?", { exact: true })).toHaveCount(0);

  const scrollBody = page.locator("[data-workspace-scroll-body]");
  await expect(scrollBody).toHaveCSS("overflow-y", "auto");
  const before = await scrollBody.evaluate((node) => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  await scrollBody.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => scrollBody.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  const visibleComposer = page.locator('[data-conversation-composer]:visible');
  await expect(visibleComposer).toBeVisible();
  await expect(visibleComposer.locator("textarea")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Çalışma alanını kapat" })).toBeVisible();
  expect(await page.evaluate(() => ({ scrollY: window.scrollY, documentHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight }))).toEqual({ scrollY: 0, documentHeight: 720, viewportHeight: 720 });
  await page.getByRole("button", { name: "Çalışma alanını kapat" }).click();
  await expect(workspace).toHaveCount(0);
  await expect(page.getByText("Bu ay net tahsilat geçen aya göre 4.000 TL daha yüksek.", { exact: true })).toBeVisible();
  await expect(page.getByText("İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?", { exact: true })).toHaveCount(0);
});

test("collection driver and target answers survive canonical Workspace completion and close", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await mockEntry(page, "OWNER");
  await page.route("**/api/payments", (route) => route.fulfill({ json: { ok: true, data: { payments: [], count: 0 } } }));
  await page.route("**/api/collection-actions", (route) => route.fulfill({ json: { ok: true, data: { collectionActions: [], count: 0 } } }));
  const turns = [
    { prompt: "Bu ay tahsilatlar neden düştü?", answer: "TRY tarafında net tahsilat 40.000 TRY azaldı; bunlar hesaplanabilir finansal katkılardır." },
    { prompt: "Hedefe göre ne kadar gerideyiz?", answer: "Aylık tahsilat hedefimize ulaşmak için 40.000 TRY daha gerekiyor." },
  ];
  let turn = 0;
  await page.route("**/api/ai/chat", (route) => {
    const current = turns[turn++]!;
    const correlationId = `e2-2-${turn}`;
    const body = [
      JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/collections", expectedSurfaceAuthorityKey: "collections.list.page" } }),
      JSON.stringify({ type: "chunk", content: current.answer, phase: "primary" }),
      JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: current.answer } }),
    ].join("\n") + "\n";
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: turns.length });

  await page.goto("/");
  for (const current of turns) {
    const composer = page.getByPlaceholder("Metrix ile konuş...");
    await composer.fill(current.prompt);
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.locator('[data-executive-target="living-workspace"]:visible')).toHaveCount(1);
    await expect(page.getByText(current.answer, { exact: true })).toHaveCount(1);
    await expect(page.getByText("İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Çalışma alanını kapat" }).click();
    await expect(page.getByText(current.answer, { exact: true })).toBeVisible();
  }
  await expect(page.locator('[data-executive-target="living-workspace"]:visible')).toHaveCount(0);
});

test("financial attention is answer-only and preserves an already-open canonical Workspace", async ({ page }) => {
  await mockEntry(page, "OWNER");
  await page.route("**/api/customers", (route) => route.fulfill({ json: { ok: true, data: { customers: [], count: 0 } } }));
  let turn = 0;
  await page.route("**/api/ai/chat", (route) => {
    turn += 1;
    const answer = turn === 1
      ? "Müşterileri açıyorum."
      : "Mevcut alacak, borç ve tahsilat verilerinde tanımlı kurallara göre dikkat gerektiren bir durum görünmüyor.";
    const events = turn === 1
      ? [JSON.stringify({ type: "navigation", command: { correlationId: "attention-open", source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } })]
      : [];
    const body = [...events, JSON.stringify({ type: "chunk", content: answer, phase: "primary" }), JSON.stringify({ type: "done", conversationId: `attention-${turn}`, ai: { content: answer } })].join("\n") + "\n";
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 2 });
  await page.goto("/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("Müşterileri göster");
  await page.getByRole("button", { name: "Gönder" }).click();
  const workspace = page.locator('[data-executive-target="living-workspace"]:visible');
  await expect(workspace).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Müşteriler" }).last()).toBeVisible();
  await composer.fill("Finans tarafında şu anda dikkat etmem gereken bir şey var mı?");
  await page.getByRole("button", { name: "Gönder" }).click();
  const attentionAnswer = page.getByText("Mevcut alacak, borç ve tahsilat verilerinde tanımlı kurallara göre dikkat gerektiren bir durum görünmüyor.", { exact: true });
  await expect(attentionAnswer).toHaveCount(1);
  await expect(workspace).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Müşteriler" }).last()).toBeVisible();
  await expect(page.getByText("İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Çalışma alanını kapat" }).click();
  await expect(attentionAnswer).toBeVisible();
  await expect(composer).toBeEnabled();
});

test("financial overview is answer-only and preserves an already-open canonical Workspace", async ({ page }) => {
  await mockEntry(page, "OWNER");
  await page.route("**/api/customers", (route) => route.fulfill({ json: { ok: true, data: { customers: [], count: 0 } } }));
  let turn = 0;
  const overviewAnswer = "Eylül 2026 döneminde gerçekleşmiş tahsilat hareketi bulunmuyor. Şu anda açık alacak bulunmuyor. Gerçek nakit pozisyonu 65.000 TRY. Eylül 2026 döneminde gerçek nakit hareketi bulunmuyor. Şu anda açık borç bulunmuyor.";
  await page.route("**/api/ai/chat", (route) => {
    turn += 1;
    const answer = turn === 1 ? "Müşterileri açıyorum." : overviewAnswer;
    const events = turn === 1
      ? [JSON.stringify({ type: "navigation", command: { correlationId: "overview-open", source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } })]
      : [];
    const body = [...events, JSON.stringify({ type: "chunk", content: answer, phase: "primary" }), JSON.stringify({ type: "done", conversationId: `overview-${turn}`, ai: { content: answer } })].join("\n") + "\n";
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
  }, { times: 2 });
  await page.goto("/");
  const composer = page.getByPlaceholder("Metrix ile konuş...");
  await composer.fill("Müşterileri göster");
  await page.getByRole("button", { name: "Gönder" }).click();
  const workspace = page.locator('[data-executive-target="living-workspace"]:visible');
  await expect(workspace).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Müşteriler" }).last()).toBeVisible();
  await composer.fill("Finansal durumumuz nasıl?");
  await page.getByRole("button", { name: "Gönder" }).click();
  const persistedOverview = page.getByText(overviewAnswer, { exact: true });
  await expect(persistedOverview).toHaveCount(1);
  await expect(workspace).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Müşteriler" }).last()).toBeVisible();
  await expect(page.getByText("İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Çalışma alanını kapat" }).click();
  await expect(persistedOverview).toBeVisible();
  await expect(composer).toBeEnabled();
});

for (const role of ["OWNER", "EMPLOYEE"] as const) {
  test(`${role} customer evidence is opened from chat inside the centered frame`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockEntry(page, role);
    const customer = role === "OWNER"
      ? { id: "customer-1", displayName: "Atlas Yapı", status: "ACTIVE", balanceCents: "420000", currency: "TRY", tier: "STRATEGIC", healthScore: 91, updatedAt: "2026-08-08T10:00:00.000Z" }
      : { id: "customer-1", displayName: "Atlas Yapı", status: "ACTIVE", currency: "TRY", updatedAt: "2026-08-08T10:00:00.000Z" };
    await page.route("**/api/customers", (route) => route.fulfill({ json: { ok: true, data: { customers: [customer], count: 1 } } }));
    let chatRequestCount = 0;
    await page.route("**/api/ai/chat", (route) => {
      chatRequestCount += 1;
      const correlationId = `field-visibility-${role.toLowerCase()}`;
      const body = [
        JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/customers", expectedSurfaceAuthorityKey: "customers.list.page" } }),
        JSON.stringify({ type: "chunk", content: "Müşteri çalışma alanını açıyorum." }),
        JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Müşteri çalışma alanını açıyorum." } }),
      ].join("\n") + "\n";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });
    await page.goto("/");
    const composer = page.getByPlaceholder("Metrix ile konuş...");
    await composer.fill("Atlas Yapı müşterisini göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByText("Müşteri çalışma alanını açıyorum.", { exact: true })).toBeVisible();
    await expect(composer).toBeEnabled();
    const reopen = page.getByRole("button", { name: "Müşteriler çalışma alanını aç" });
    if (await reopen.isVisible()) await reopen.click();
    const card = page.getByTestId("customer-workspace-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("Atlas Yapı", { exact: true })).toBeVisible();
    const workspace = page.getByRole("region", { name: "Çalışma Alanı" });
    await expect(workspace).toHaveCSS("opacity", "1");
    expect(chatRequestCount).toBe(1);
    if (role === "OWNER") await expect(card.getByText("Toplam bakiye", { exact: true }).first()).toBeVisible();
    else await expect(card.getByText("Toplam bakiye")).toHaveCount(0);
    await page.locator('[data-workspace-frame="centered"]').screenshot({ path: `qa-screenshots/customer-field-visibility-${role.toLowerCase()}.png` });
  });
}

test("composes the renewed framed OWNER and EMPLOYEE evidence", async ({ page }) => {
  const owner = readFileSync("qa-screenshots/customer-field-visibility-owner.png").toString("base64");
  const employee = readFileSync("qa-screenshots/customer-field-visibility-employee.png").toString("base64");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#14120f;color:#ede7d9;font:700 18px system-ui}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}.label{text-align:center;padding:8px}.shot{width:100%;display:block}</style><div class="grid"><section><div class="label">OWNER · sohbetten açılan çerçeveli müşteri kartı</div><img class="shot" src="data:image/png;base64,${owner}"></section><section><div class="label">EMPLOYEE · sohbetten açılan çerçeveli müşteri kartı</div><img class="shot" src="data:image/png;base64,${employee}"></section></div>`);
  await page.screenshot({ path: "qa-screenshots/customer-field-visibility-comparison.png", fullPage: true });
});
