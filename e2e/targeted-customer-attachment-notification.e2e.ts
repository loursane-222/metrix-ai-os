import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("a committed customer attachment notifies the explicitly named employee without sensitive copy", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const organization = await prisma.organization.create({ data: { name: `Target Notification ${suffix}`, onboardingStatus: "COMPLETED" } });
  const owner = await prisma.user.create({ data: { phone: `owner-${suffix}@metrix.invalid`, fullName: "Gönderen Owner", onboardingStatus: "COMPLETED" } });
  const employee = await prisma.user.create({ data: { phone: `employee-${suffix}@metrix.invalid`, fullName: "Ahmet Yılmaz", onboardingStatus: "COMPLETED" } });
  const managerOne = await prisma.user.create({ data: { phone: `manager1-${suffix}@metrix.invalid`, fullName: "Ayşe Kaya", onboardingStatus: "COMPLETED" } });
  const managerTwo = await prisma.user.create({ data: { phone: `manager2-${suffix}@metrix.invalid`, fullName: "Deniz Demir", onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.createMany({ data: [
    { organizationId: organization.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
    { organizationId: organization.id, userId: employee.id, role: "EMPLOYEE", status: "ACTIVE" },
    { organizationId: organization.id, userId: managerOne.id, role: "MANAGER", status: "ACTIVE" },
    { organizationId: organization.id, userId: managerTwo.id, role: "MANAGER", status: "ACTIVE" },
  ] });
  const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Hassas Müşteri", balanceCents: BigInt(987654), tier: "STRATEGIC", healthScore: 91, metrixNote: "Gizli yönetim notu", source: "ACCEPTANCE" } });
  const ownerSession = await createSession(owner.id, false);
  const employeeSession = await createSession(employee.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: ownerSession.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const upload = await page.request.post("/api/customers/document-attachments", { multipart: { file: { name: "gizli-finans-belgesi.pdf", mimeType: "application/pdf", buffer: Buffer.from("test") } } });
    expect(upload.status(), await upload.text()).toBe(200);
    const attachmentRef = (await upload.json()).data.attachmentRef as string;
    await prisma.customerDocumentAttachment.update({ where: { id: attachmentRef }, data: { committedCustomerId: customer.id, reviewStatus: "COMMITTED" } });
    const delivered = await page.request.post(`/api/customers/document-attachments/${attachmentRef}/notify`, { data: { target: "Ahmet'e" } });
    expect(delivered.status(), await delivered.text()).toBe(200);
    expect((await delivered.json()).data).toMatchObject({ status: "DELIVERED", recipientName: "Ahmet Yılmaz" });
    const ambiguous = await page.request.post(`/api/customers/document-attachments/${attachmentRef}/notify`, { data: { target: "yöneticiye" } });
    expect((await ambiguous.json()).data).toMatchObject({ status: "CLARIFICATION_REQUIRED", candidates: ["Ayşe Kaya", "Deniz Demir"] });
    const personal = await page.request.post(`/api/customers/document-attachments/${attachmentRef}/notify`, { data: { target: "yöneticime" } });
    expect((await personal.json()).data).toMatchObject({ status: "CLARIFICATION_REQUIRED", candidates: [], reason: "PERSONAL_HIERARCHY_UNAVAILABLE" });

    await page.setContent(`<main style="font:16px system-ui;padding:32px;background:#14120f;color:#ede7d9;min-height:100vh"><h1>Gönderen kanıtı</h1><p>Belge bildirimini Ahmet Yılmaz adlı kullanıcıya gönderdim.</p><p>Kaynak: Customer · ${customer.id}</p></main>`);
    await page.screenshot({ path: "qa-screenshots/hedefli-bildirim-gonderen.png", fullPage: true });

    await context.clearCookies();
    await context.addCookies([{ name: "metrix_session", value: employeeSession.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const inbox = await page.request.get("/api/notifications");
    const payload = await inbox.json();
    expect(payload.data.notifications).toHaveLength(1);
    expect(payload.data.notifications[0]).toMatchObject({ recipientUserId: employee.id, title: "Müşteriye yeni bir belge eklendi", entityType: "Customer", entityId: customer.id });
    expect(JSON.stringify(payload)).not.toMatch(/987654|STRATEGIC|Gizli yönetim notu|gizli-finans-belgesi/iu);
    await page.route("**/api/brand-film", (route) => route.fulfill({ json: { ok: true, data: { shouldOffer: false } } }));
    await page.route("**/api/executive/approvals", (route) => route.fulfill({ json: { ok: true, data: { approvals: [] } } }));
    await page.route("**/api/executive/lifecycle", (route) => route.fulfill({ json: { ok: true, data: { envelopes: [] } } }));
    await page.route("**/api/first-experience", (route) => route.fulfill({ json: { ok: true, data: { active: false, conversationId: null, messages: [] } } }));
    await page.route("**/api/ai/chat", (route) => {
      const correlationId = "targeted-notification-inbox";
      const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/notifications", expectedSurfaceAuthorityKey: "workspace.notification.page" } }), JSON.stringify({ type: "chunk", content: "Bildirimlerinizi açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Bildirimlerinizi açıyorum." } })].join("\n") + "\n";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });
    await page.goto("/");
    const composer = page.getByPlaceholder("Metrix ile konuş...");
    await composer.fill("Canonical notification navigation fixture");
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByText("Bildirimlerinizi açıyorum.", { exact: true })).toBeVisible();
    await expect(composer).toBeEnabled();
    const reopen = page.getByRole("button", { name: "Bildirimler çalışma alanını aç" });
    if (await reopen.isVisible()) await reopen.click();
    await expect(page.getByText("Müşteriye yeni bir belge eklendi", { exact: true })).toBeVisible();
    await expect(page.getByText("İlgili müşteri kaydını kendi erişim yetkiniz kapsamında inceleyebilirsiniz.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Müşteri kaydını aç" })).toBeVisible();
    await page.locator('[data-workspace-frame="centered"]').screenshot({ path: "qa-screenshots/hedefli-bildirim-alici.png" });
    await page.getByRole("button", { name: "Müşteri kaydını aç" }).click();
    await expect(page.getByRole("heading", { name: "Hassas Müşteri" })).toBeVisible();
    await expect(page.getByText("Gizli yönetim notu")).toHaveCount(0);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    for (const user of [owner, employee, managerOne, managerTwo]) await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
