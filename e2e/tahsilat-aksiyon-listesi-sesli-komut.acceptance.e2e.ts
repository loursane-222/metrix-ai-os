import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("iki tahsilat aksiyonundan doğru satırı komutla tamamlar", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `collection-list-${suffix}@metrix.invalid`, fullName: "Aksiyon Liste", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `COLLECTION LIST ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Ahmet Firma ${suffix}` } });
    const firstPayment = await prisma.payment.create({ data: { organizationId: organization.id, customerId: customer.id, title: `Ahmet Arama ${suffix}`, amount: 1_000, status: "OVERDUE" } });
    const secondPayment = await prisma.payment.create({ data: { organizationId: organization.id, customerId: customer.id, title: `Zeynep Takip ${suffix}`, amount: 900, status: "OVERDUE" } });
    const first = await prisma.collectionAction.create({ data: { organizationId: organization.id, paymentId: firstPayment.id, title: "Arama sonucu", actionType: "CALL", status: "OPEN" } });
    const second = await prisma.collectionAction.create({ data: { organizationId: organization.id, paymentId: secondPayment.id, title: "Takip sonucu", actionType: "FOLLOW_UP", status: "OPEN" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    let call = 0; await page.route("**/api/collection-actions/actions/edit-command", async (route) => { call += 1; const command = call === 1 ? { type: "request", collectionActionId: first.id, status: "DONE" } : { type: "confirm", collectionActionId: first.id }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) }); });
    await page.goto("/metrix"); const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill(`${customer.displayName} için 50 TL tahsilat kaydet`); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    const paymentRow = page.locator('[data-canonical-domain="payment"] .workspace-record-item', { hasText: firstPayment.title }); await expect(paymentRow).toBeVisible({ timeout: 30_000 }); await paymentRow.getByRole("button", { name: "Tahsilat detayını aç" }).dispatchEvent("click");
    await expect(page.getByText(`Ahmet Arama ${suffix}`, { exact: true }).first()).toBeVisible({ timeout: 30_000 }); await expect(page.getByText(`Zeynep Takip ${suffix}`, { exact: true }).first()).toBeVisible();
    await composer.fill("Ahmet aramasını tamamla"); await page.getByRole("button", { name: "Gönder", exact: true }).click(); await expect.poll(() => call).toBe(1); await expect(page.getByRole("complementary", { name: "Bekleyen iş: Tahsilat aksiyonu bekliyor" })).toBeVisible({ timeout: 30_000 });
    await composer.fill("Ahmet aramasını kesinleştir"); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect.poll(async () => (await prisma.collectionAction.findUnique({ where: { id: first.id } }))?.status).toBe("DONE"); expect((await prisma.collectionAction.findUnique({ where: { id: second.id } }))?.status).toBe("OPEN");
    await expect(page.getByText(`Zeynep Takip ${suffix}`, { exact: true }).first()).toBeVisible(); await page.screenshot({ path: "qa-screenshots/tahsilat-aksiyon-listesi-dogru-hedef.png", fullPage: true });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
