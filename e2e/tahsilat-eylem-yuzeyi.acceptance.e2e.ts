import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("tahsilat eylem yüzeyi Executive Stroke ile kaydeder ve vazgeçmeyi korur", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `payment-surface-${suffix}@metrix.invalid`, fullName: "Tahsilat Yüzeyi Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `PAYMENT SURFACE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Tahsilat Müşterisi ${suffix}` } });
    const invoice = await prisma.invoice.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceNumber: `THS-${suffix}`, title: `Tahsilat faturası ${suffix}`, amount: 1_000, taxAmount: 200, totalAmount: 1_200, currency: "TRY", status: "SENT" } });
    const payment = await prisma.payment.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceId: invoice.id, title: `Gerçek tahsilat ${suffix}`, amount: 1_000, paidAmount: 200, currency: "TRY", status: "PARTIAL" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill(`${customer.displayName} için 50 TL tahsilat kaydet`); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    const row = page.locator('[data-canonical-domain="payment"] .workspace-record-item', { hasText: payment.title }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.getByRole("button", { name: "Tahsilat detayını aç" }).click();
    const surface = page.locator(`[data-payment-action-surface="${payment.id}"]`); await expect(surface).toBeVisible();
    await surface.getByLabel("Tahsil edilen tutar").fill("300"); await surface.getByRole("button", { name: "Tahsilatı onaya gönder" }).click();
    const rail = surface.getByRole("complementary", { name: "Bekleyen iş: Tahsilat onayı bekliyor" }); await expect(rail).toBeVisible();
    const stroke = rail.getByRole("slider", { name: "Tahsilatı Kesinleştir" }); await stroke.focus(); await page.keyboard.press("Enter");
    await expect(surface.getByText("₺500,00", { exact: true }).first()).toBeVisible({ timeout: 20_000 }); await expect(surface.getByText("Kısmi Ödendi", { exact: true })).toBeVisible();
    expect(await paymentState(payment.id)).toEqual({ paidAmount: "500", status: "PARTIAL" });
    await surface.getByLabel("Tahsil edilen tutar").fill("100"); await surface.getByRole("button", { name: "Tahsilatı onaya gönder" }).click();
    await surface.getByRole("button", { name: "Vazgeç" }).click(); await expect(surface.getByRole("button", { name: "Tahsilatı onaya gönder" })).toBeVisible();
    expect(await paymentState(payment.id)).toEqual({ paidAmount: "500", status: "PARTIAL" });
    await page.screenshot({ path: "qa-screenshots/tahsilat-executive-stroke-sonucu.png", fullPage: true });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});

async function paymentState(id: string) { const payment = await prisma.payment.findUnique({ where: { id } }); return { paidAmount: String(payment?.paidAmount), status: payment?.status }; }
