import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("açık stok yüzeyi sohbet komutlarıyla gerçek mal kabul oluşturur", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `stock-voice-${suffix}@metrix.invalid`, fullName: "Stok Komut QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `STOCK VOICE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Pirinç Levha ${suffix}`, type: "PRODUCT", unit: "adet", status: "ACTIVE" } });
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `Metal Tedarik ${suffix}`, status: "ACTIVE" } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId: organization.id, name: `Ana Depo ${suffix}`, code: `ANA-${suffix}` } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/stock/actions/edit-command", async (route) => {
      const utterance = (route.request().postDataJSON() as { utterance: string }).utterance;
      const command = utterance.includes("ürünü") ? { type: "set_field", tabId: "receipt", field: "productServiceId", value: product.id }
        : utterance.includes("depoyu") ? { type: "set_field", tabId: "receipt", field: "warehouseId", value: warehouse.id }
          : utterance.includes("tedarikçiyi") ? { type: "set_field", tabId: "receipt", field: "supplierId", value: supplier.id }
            : utterance.includes("miktarı") ? { type: "set_field", tabId: "receipt", field: "quantity", value: "7" }
              : { type: "submit" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) });
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill("stok işlemlerini aç"); await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.locator("[data-stock-operation-surface]")).toBeVisible({ timeout: 30_000 });
    await composer.fill(`ürünü ${product.name} yap`); await page.getByRole("button", { name: "Gönder" }).click(); await expect(page.getByLabel("Ürün")).toHaveValue(product.id);
    await composer.fill(`depoyu ${warehouse.code} yap`); await page.getByRole("button", { name: "Gönder" }).click(); await expect(page.getByLabel("Depo")).toHaveValue(warehouse.id);
    await composer.fill(`tedarikçiyi ${supplier.displayName} yap`); await page.getByRole("button", { name: "Gönder" }).click(); await expect(page.getByLabel("Tedarikçi")).toHaveValue(supplier.id);
    await composer.fill("miktarı 7 yap"); await page.getByRole("button", { name: "Gönder" }).click(); await expect(page.getByLabel("Miktar")).toHaveValue("7");
    await composer.fill("mal kabulü kaydet"); await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByRole("status")).toHaveText("Mal kabul kaydedildi.", { timeout: 30_000 });
    await page.screenshot({ path: "qa-screenshots/stok-sesli-komut-mal-kabul.png", fullPage: true });
    const stock = await prisma.stock.findFirst({ where: { organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id } });
    expect(Number(stock?.quantity)).toBe(7);
    const movement = await prisma.stockMovement.findFirst({ where: { organizationId: organization.id, stockId: stock!.id, movementType: "RECEIPT" } });
    expect(movement?.supplierId).toBe(supplier.id);
    expect(Number(movement?.quantity)).toBe(7);
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
