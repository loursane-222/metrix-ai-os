import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { createNewOrder } from "@/lib/core/orders/order.service";

test("sipariş aksiyon yüzeyi gerçek DOM üzerinden tüm mutasyonları işler", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `order-actions-${suffix}@metrix.invalid`, fullName: "Sipariş Aksiyon Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `ORDER ACTION ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Aksiyon Müşterisi ${suffix}`, source: "ACCEPTANCE" } });
    const order = await createNewOrder({ organizationId: organization.id, customerId: customer.id, deadlineAt: new Date("2026-09-10T12:00:00Z"), items: [
      { name: `Ana ürün ${suffix}`, unit: "adet", quantity: 4, unitPriceCents: BigInt(125_00), lineTotalCents: BigInt(500_00) },
      { name: `Silinecek ürün ${suffix}`, unit: "adet", quantity: 2, unitPriceCents: BigInt(50_00), lineTotalCents: BigInt(100_00) },
    ] });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/metrix");
    await page.getByRole("textbox", { name: "Metrix ile konuş..." }).fill("siparişlerimizi göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="order"] .workspace-record-row', { hasText: order!.orderNumber });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const surface = page.locator(`[data-order-action-surface="${order!.id}"]`);
    await expect(surface).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Yeni miktar").fill("7");
    await page.getByLabel("Miktar değişikliği sebebi").fill("Müşteri adedi artırdı");
    await page.screenshot({ path: "qa-screenshots/siparis-duzenleme-revizyon-formu.png", fullPage: true });
    await page.getByRole("button", { name: "Miktarı güncelle" }).click();
    await expect(surface.getByText("Revizyon 1 · Miktar değişikliği")).toBeVisible();

    await page.getByLabel("Yeni teslim tarihi").fill("2026-09-18");
    await page.getByLabel("Teslim tarihi değişikliği sebebi").fill("Müşteri takvim güncellemesi");
    await page.getByRole("button", { name: "Teslim tarihini güncelle" }).click();
    await expect(surface.getByText("Revizyon 2 · Teslim tarihi değişikliği")).toBeVisible();

    await page.getByLabel("Kategori").selectOption("QUALITY_ISSUE");
    await page.getByLabel("İstisna notu").fill("Kalite kontrolü yeniden yapılacak");
    await page.getByRole("button", { name: "İstisna kaydet" }).click();
    await expect(surface.getByText("Kalite kontrolü yeniden yapılacak")).toBeVisible();

    await page.getByLabel("Durum geçişi sebebi").fill("Operasyon onayı alındı");
    await page.getByRole("button", { name: "Onaylandı", exact: true }).click();
    await expect(surface.getByText("Taslak → Onaylandı")).toBeVisible();
    await expect(page.getByRole("button", { name: "Planlandı", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Üretimde", exact: true })).toHaveCount(0);

    await page.getByLabel("Silinecek kalem").selectOption({ label: `Silinecek ürün ${suffix}` });
    await page.getByLabel("Kalem silme sebebi").fill("Müşteri bu kalemi çıkardı");
    await page.getByRole("button", { name: "Kalemi sil" }).click();
    await expect(surface.getByText("Revizyon 3 · Kalem silme")).toBeVisible();
    await expect(page.getByLabel("Silinecek kalem").locator(`option:has-text("Silinecek ürün ${suffix}")`)).toHaveCount(0);
    await surface.getByText("Revizyon geçmişi", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "qa-screenshots/siparis-duzenleme-gercek-gecmis.png", fullPage: false });

    await page.getByLabel("İptal sebebi").fill("Müşteri siparişi geri çekti");
    await page.getByRole("button", { name: "Siparişi iptal et" }).click();
    await expect(surface.getByText("İptal edildi", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Siparişi iptal et" })).toHaveCount(0);

    const persisted = await prisma.order.findUnique({ where: { id: order!.id }, include: { items: true, revisions: true, exceptions: true, statusHistory: true } });
    expect(persisted?.status).toBe("CANCELLED");
    expect(persisted?.revisions).toHaveLength(3);
    expect(persisted?.exceptions).toHaveLength(1);
    expect(persisted?.items.find((item) => item.name.startsWith("Silinecek"))?.removedAt).not.toBeNull();
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
