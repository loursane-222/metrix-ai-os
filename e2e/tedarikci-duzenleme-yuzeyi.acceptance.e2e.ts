import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("tedarikçi düzenleme yüzeyi alanları kaydeder, geri alır ve arşivler", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `supplier-edit-${suffix}@metrix.invalid`, fullName: "Tedarikçi Düzenleme Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `SUPPLIER EDIT ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `Başlangıç Metal ${suffix}`, legalName: "Başlangıç Metal Ltd.", phone: "+90 212 000 00 00", status: "ACTIVE" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("tedarikçileri göster"); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="supplier"] .workspace-record-row', { hasText: supplier.displayName }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-supplier-edit-surface="${supplier.id}"]`); await expect(surface).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Tedarikçi adı").fill(`Güncel Metal ${suffix}`); await page.getByLabel("Telefon").fill("+90 532 111 22 33"); await page.getByLabel("E-posta").fill(`satinalma-${suffix}@example.com`); await page.getByLabel("Web sitesi").fill("https://guncel-metal.example"); await page.getByLabel("Not", { exact: true }).fill("Stratejik tedarik ortağı"); await page.getByLabel("Risk notları").fill("Kur riski aylık izlenecek"); await page.getByLabel("Durum").selectOption("PASSIVE");
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click(); await expect(page.getByRole("status")).toHaveText("Tedarikçi bilgileri kaydedildi."); await expect(surface.locator("header").getByText("Pasif", { exact: true })).toBeVisible();
    await page.getByLabel("Tedarikçi adı").fill("Kaydedilmemesi gereken ad"); await page.getByRole("button", { name: "Geri al" }).click(); await expect(page.getByLabel("Tedarikçi adı")).toHaveValue(`Güncel Metal ${suffix}`);
    await page.getByRole("button", { name: "Tedarikçiyi arşivle" }).click(); await expect(page.getByRole("status")).toHaveText("Tedarikçi arşivlendi."); await expect(surface.locator("header").getByText("Arşivlendi", { exact: true })).toBeVisible();
    await page.screenshot({ path: "qa-screenshots/tedarikci-duzenleme-ve-arsivleme.png", fullPage: true });
    const stored = await prisma.supplier.findUnique({ where: { id: supplier.id } }); expect(stored).toMatchObject({ displayName: `Güncel Metal ${suffix}`, phone: "+90 532 111 22 33", email: `satinalma-${suffix}@example.com`, website: "https://guncel-metal.example", metrixNote: "Stratejik tedarik ortağı", riskNotes: "Kur riski aylık izlenecek", status: "ARCHIVED" });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
