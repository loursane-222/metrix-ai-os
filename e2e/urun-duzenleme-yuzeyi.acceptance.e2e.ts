import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("ürün düzenleme yüzeyi alanları kaydeder, geri alır ve arşivler", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `product-edit-${suffix}@metrix.invalid`, fullName: "Ürün Düzenleme Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `PRODUCT EDIT ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Başlangıç Ürünü ${suffix}`, type: "PRODUCT", category: "Donanım", unit: "adet", costCents: 125_00, priceCents: 200_00, currency: "TRY", stockBehavior: "Stoklu", status: "ACTIVE" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("ürünleri göster"); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="product"] .workspace-record-row', { hasText: product.name }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-product-edit-surface="${product.id}"]`); await expect(surface).toBeVisible({ timeout: 20_000 });
    await surface.getByLabel("Ürün adı").fill(`Güncel Ürün ${suffix}`); await surface.getByLabel("Tür").selectOption("SERVICE"); await surface.getByLabel("Kategori").fill("Danışmanlık"); await surface.getByLabel("Birim", { exact: true }).fill("saat"); await surface.getByLabel("Maliyet").fill("175,50"); await surface.getByLabel("Fiyat").fill("325,75"); await surface.getByLabel("Para birimi").fill("eur"); await surface.getByLabel("Stok davranışı").fill("Stoksuz hizmet"); await surface.getByLabel("Durum").selectOption("PASSIVE");
    await surface.getByRole("button", { name: "Değişiklikleri kaydet" }).click(); await expect(surface.getByRole("status")).toHaveText("Ürün bilgileri kaydedildi."); await expect(surface.locator("header").getByText("Pasif", { exact: true })).toBeVisible();
    await surface.getByLabel("Ürün adı").fill("Kaydedilmemesi gereken ürün"); await surface.getByLabel("Fiyat").fill("999"); await surface.getByRole("button", { name: "Geri al" }).click(); await expect(surface.getByLabel("Ürün adı")).toHaveValue(`Güncel Ürün ${suffix}`); await expect(surface.getByLabel("Fiyat")).toHaveValue("325.75");
    await surface.getByRole("button", { name: "Ürünü arşivle" }).click(); await expect(surface.getByRole("status")).toHaveText("Ürün arşivlendi."); await expect(surface.locator("header").getByText("Arşivlendi", { exact: true })).toBeVisible();
    await page.screenshot({ path: "qa-screenshots/urun-duzenleme-ve-arsivleme.png", fullPage: true });
    const stored = await prisma.productService.findUnique({ where: { id: product.id } }); expect(stored).toMatchObject({ name: `Güncel Ürün ${suffix}`, type: "SERVICE", category: "Danışmanlık", unit: "saat", costCents: BigInt("17550"), priceCents: BigInt("32575"), currency: "EUR", stockBehavior: "Stoksuz hizmet", status: "ARCHIVED" });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
