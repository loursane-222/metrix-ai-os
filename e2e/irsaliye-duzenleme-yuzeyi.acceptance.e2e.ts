import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { createNewDelivery } from "@/lib/core/deliveries/delivery.service";

test("irsaliye aksiyon yüzeyi tüm mutasyonları gerçek DOM ve DB üzerinden işler", async ({ context, page }) => {
  test.setTimeout(240_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `delivery-actions-${suffix}@metrix.invalid`, fullName: "İrsaliye Aksiyon Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `DELIVERY ACTION ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Teslimat Müşterisi ${suffix}`, source: "ACCEPTANCE" } });
    const order = await prisma.order.create({ data: { organizationId: organization.id, customerId: customer.id, orderNumber: `SIP-DEL-${suffix}`, status: "READY", items: { create: [{ organizationId: organization.id, name: `Kırılabilir ürün ${suffix}`, unit: "koli", quantity: 5, unitPriceCents: BigInt(100_00), lineTotalCents: BigInt(500_00) }] } }, include: { items: true } });
    const delivery = await createNewDelivery({ organizationId: organization.id, sourceOrderId: order.id, customerId: customer.id, carrier: "Metrix Lojistik", items: [{ orderItemId: order.items[0]!.id, name: order.items[0]!.name, unit: "koli", quantity: 5 }] });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("irsaliyeleri göster"); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="delivery"] .workspace-record-row', { hasText: delivery!.deliveryNumber }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-delivery-action-surface="${delivery!.id}"]`); await expect(surface).toBeVisible({ timeout: 20_000 });

    await page.getByLabel("Durum bayrağı").selectOption("DAMAGED");
    await page.getByLabel("İstisna kategorisi").selectOption("PRODUCT_DAMAGED"); await page.getByLabel("İstisna notu").fill("Ambalaj teslim sırasında ezilmiş");
    await page.getByLabel("Teslimat onay kodu").fill("KANIT-42"); await page.getByLabel("Teslim alan kişi").fill("Ayşe Demir"); await page.getByLabel("İmza alındı").check(); await page.getByLabel("Teslimat kanıtı notu").fill("Depo sorumlusuna teslim edildi");
    await page.screenshot({ path: "qa-screenshots/irsaliye-duzenleme-aksiyon-formlari.png", fullPage: true });

    await page.getByRole("button", { name: "Kalem durumunu kaydet" }).click(); await expect(surface.getByText("Hasarlı").first()).toBeVisible();
    await page.getByRole("button", { name: "Teslimat kanıtını kaydet" }).click(); await expect(surface.getByText(/Son kanıt: Ayşe Demir · KANIT-42 · İmzalı/)).toBeVisible();
    await page.getByRole("button", { name: "İstisna kaydet" }).click(); await expect(surface.getByText("Ambalaj teslim sırasında ezilmiş")).toBeVisible();
    await page.getByLabel("Durum geçişi sebebi").fill("Hazırlık operasyonu başladı"); await page.getByRole("button", { name: "Hazırlanıyor", exact: true }).click();
    await expect(surface.getByText("Taslak → Hazırlanıyor")).toBeVisible(); await expect(page.getByRole("button", { name: "Toplanıyor", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Paketleniyor", exact: true })).toHaveCount(0);
    await surface.getByText("İstisna geçmişi", { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: "qa-screenshots/irsaliye-duzenleme-gercek-gecmis.png", fullPage: false });
    await page.getByLabel("İrsaliye iptal sebebi").fill("Müşteri sevkiyatı durdurdu"); await page.getByRole("button", { name: "İrsaliyeyi iptal et" }).click(); await expect(surface.getByText("İptal edildi", { exact: true })).toBeVisible();

    const stored = await prisma.delivery.findUnique({ where: { id: delivery!.id }, include: { items: true, exceptions: true, statusHistory: true } });
    expect(stored?.status).toBe("CANCELLED"); expect(stored?.items[0]?.conditionFlag).toBe("DAMAGED"); expect(stored?.exceptions).toHaveLength(1); expect(stored?.exceptions[0]?.category).toBe("PRODUCT_DAMAGED"); expect(stored?.receiverName).toBe("Ayşe Demir"); expect(stored?.deliveryProof).toMatchObject({ confirmationCode: "KANIT-42", signatureCaptured: true }); expect(stored?.statusHistory.some((entry) => entry.toStatus === "PREPARING")).toBe(true); expect(stored?.statusHistory.some((entry) => entry.toStatus === "CANCELLED")).toBe(true);
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
