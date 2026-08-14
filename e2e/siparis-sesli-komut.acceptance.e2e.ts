import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { createNewOrder } from "@/lib/core/orders/order.service";

test("açık sipariş yüzeyi sohbet komutuyla form doldurmadan teslim tarihini değiştirir", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `order-voice-${suffix}@metrix.invalid`, fullName: "Sipariş Komut Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `ORDER COMMAND ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Komut Müşterisi ${suffix}`, source: "ACCEPTANCE" } });
    const order = await createNewOrder({ organizationId: organization.id, customerId: customer.id, deadlineAt: new Date("2026-09-10T12:00:00.000Z"), items: [{ name: `Komut ürünü ${suffix}`, unit: "adet", quantity: 3, unitPriceCents: BigInt(100_00), lineTotalCents: BigInt(300_00) }] });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route(`**/api/orders/${order!.id}/actions/edit-command`, async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "revise_deadline", deadlineAt: "2026-09-20T12:00:00.000Z", reason: "Müşteri teslim planını değiştirdi" } } } } }) }); });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("siparişlerimizi göster"); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="order"] .workspace-record-row', { hasText: order!.orderNumber }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-order-action-surface="${order!.id}"]`); await expect(surface).toBeVisible();
    await expect(page.getByLabel("Yeni teslim tarihi")).toHaveValue("");
    await composer.fill("teslim tarihini 20 Eylül 2026 yap"); await page.getByRole("button", { name: "Gönder" }).click();
    await expect(surface.getByText("Revizyon 1 · Teslim tarihi değişikliği")).toBeVisible({ timeout: 20_000 });
    await surface.getByText("Revizyon geçmişi", { exact: true }).scrollIntoViewIfNeeded();
    await expect(surface.getByText("Müşteri teslim planını değiştirdi")).toBeVisible();
    await page.screenshot({ path: "qa-screenshots/siparis-sesli-komut-teslim-tarihi.png", fullPage: false });
    const persisted = await prisma.order.findUnique({ where: { id: order!.id }, include: { revisions: true } }); expect(persisted?.deadlineAt?.toISOString()).toBe("2026-09-20T12:00:00.000Z"); expect(persisted?.revisions).toHaveLength(1);
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
