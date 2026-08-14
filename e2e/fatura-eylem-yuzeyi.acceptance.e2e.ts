import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("taslak fatura gerçek eylem yüzeyinden gönderilir", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `invoice-action-${suffix}@metrix.invalid`, fullName: "Fatura Eylem Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `INVOICE ACTION ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Kabul Müşterisi ${suffix}` } });
    const invoice = await prisma.invoice.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceNumber: `FTR-${suffix}`, title: `Kabul faturası ${suffix}`, amount: 1_000, taxRate: 20, taxAmount: 200, totalAmount: 1_200, currency: "TRY", status: "DRAFT", dueDate: new Date("2026-09-15T09:00:00.000Z") } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill(`${customer.displayName} için 500 TL fatura kes`); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="invoice"] .workspace-record-row', { hasText: invoice.invoiceNumber });
    await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-invoice-action-surface="${invoice.id}"]`);
    await expect(surface).toBeVisible({ timeout: 20_000 });
    await expect(surface.getByText("Taslak", { exact: true })).toBeVisible();
    await surface.getByRole("button", { name: "Faturayı Gönder" }).click();
    await expect(surface.getByText("Gönderildi", { exact: true })).toBeVisible();
    await expect(surface.getByRole("button", { name: "Faturayı Gönder" })).toHaveCount(0);
    await expect(surface.getByText("Bu faturada başka aksiyon yok.")).toBeVisible();
    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored?.status).toBe("SENT");
    await page.screenshot({ path: "qa-screenshots/fatura-gonderildi-eylem-yuzeyi.png", fullPage: true });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
