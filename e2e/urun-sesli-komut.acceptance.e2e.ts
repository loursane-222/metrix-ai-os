import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("açık ürün yüzeyi sohbet komutuyla fiyatı kaydeder", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `product-voice-${suffix}@metrix.invalid`, fullName: "Ürün Komut Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `PRODUCT VOICE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Komut Ürünü ${suffix}`, type: "PRODUCT", priceCents: 200_00, currency: "TRY" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route(`**/api/products/${product.id}/actions/edit-command`, async (route) => { const utterance = (route.request().postDataJSON() as { utterance: string }).utterance; const command = utterance.includes("kaydet") ? { type: "commit" } : { type: "set_field", field: "priceCents", value: "500" }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) }); });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("ürünleri göster"); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="product"] .workspace-record-row', { hasText: product.name }); await expect(row).toBeVisible({ timeout: 30_000 }); await expect(composer).toBeEnabled({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-product-edit-surface="${product.id}"]`); await expect(surface).toBeVisible();
    await composer.fill("fiyatı 500 TL yap"); const editResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/ai/chat") && response.request().method() === "POST"); await page.getByRole("button", { name: "Gönder" }).click(); expect((await editResponsePromise).ok()).toBe(true); await expect(surface.getByLabel("Fiyat")).toHaveValue("500"); await expect(composer).toBeEnabled({ timeout: 30_000 }); expect((await prisma.productService.findUnique({ where: { id: product.id } }))?.priceCents).toBe(BigInt("20000"));
    await composer.fill("değişiklikleri kaydet"); await page.getByRole("button", { name: "Gönder" }).click(); await expect(surface.getByRole("status")).toHaveText("Ürün bilgileri kaydedildi."); await expect(composer).toBeEnabled({ timeout: 30_000 }); expect((await prisma.productService.findUnique({ where: { id: product.id } }))?.priceCents).toBe(BigInt("50000"));
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
