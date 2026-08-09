import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("stok faz2 kanit: sayim + saglik + sinyaller + temizlik", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `stok-faz2-${suffix}@metrix.invalid`, fullName: "Stok Faz 2 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `STOK FAZ2 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId: organization.id, name: "Ana Depo", code: `F2-${suffix}` } });
    const criticalProduct = await prisma.productService.create({ data: { organizationId: organization.id, name: `Kritik Ürün ${suffix}`, type: "PRODUCT", unit: "adet", minStockLevel: 10 } });
    const thresholdlessProduct = await prisma.productService.create({ data: { organizationId: organization.id, name: `Eşiksiz Ürün ${suffix}`, type: "PRODUCT", unit: "adet" } });
    const criticalStock = await prisma.stock.create({ data: { organizationId: organization.id, productServiceId: criticalProduct.id, warehouseId: warehouse.id, quantity: 5, status: "AVAILABLE" } });
    const thresholdlessStock = await prisma.stock.create({ data: { organizationId: organization.id, productServiceId: thresholdlessProduct.id, warehouseId: warehouse.id, quantity: 1, status: "AVAILABLE" } });

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);

    const firstCount = await page.request.post("/api/stock/counts", { data: { stockId: criticalStock.id, countedQuantity: 3, note: "Raf sayımı" } });
    const secondCount = await page.request.post("/api/stock/counts", { data: { stockId: thresholdlessStock.id, countedQuantity: 2, note: "Kontrol sayımı" } });
    expect(firstCount.status()).toBe(201);
    expect(secondCount.status()).toBe(201);
    const first = await firstCount.json() as { data: { record: { id: string } } };
    const second = await secondCount.json() as { data: { record: { id: string } } };
    expect(Number((await prisma.stock.findUniqueOrThrow({ where: { id: criticalStock.id } })).quantity)).toBe(5);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill("stoku göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    const investigation = page.getByTestId("stock-variance-investigation");
    await investigation.waitFor({ state: "visible", timeout: 30_000 });
    await expect(investigation).toContainText("sistem 5");
    await expect(investigation).toContainText("sayım 3");
    await investigation.screenshot({ path: "qa-screenshots/stok-faz2-envanter-dogrulugu.png" });

    await investigation.locator("div", { hasText: criticalProduct.name }).getByRole("button", { name: "Onayla ve düzelt" }).click();
    await investigation.locator("div", { hasText: thresholdlessProduct.name }).getByRole("button", { name: "Reddet" }).click();
    await expect(investigation).toBeHidden({ timeout: 30_000 });
    expect(Number((await prisma.stock.findUniqueOrThrow({ where: { id: criticalStock.id } })).quantity)).toBe(3);
    expect(Number((await prisma.stock.findUniqueOrThrow({ where: { id: thresholdlessStock.id } })).quantity)).toBe(1);
    expect((await prisma.stockCountRecord.findUniqueOrThrow({ where: { id: first.data.record.id } })).status).toBe("CORRECTED");
    expect((await prisma.stockCountRecord.findUniqueOrThrow({ where: { id: second.data.record.id } })).status).toBe("DISMISSED");
    expect(await prisma.stockMovement.count({ where: { organizationId: organization.id, stockId: criticalStock.id, movementType: "ADJUSTMENT", sourceType: "ADJUSTMENT" } })).toBe(1);

    const healthResponse = await page.request.get("/api/stock/intelligence/health");
    const health = await healthResponse.json() as { data: { categories: { criticalStock: { sampleStockIds: string[] } } } };
    expect(health.data.categories.criticalStock.sampleStockIds).toContain(criticalStock.id);
    expect(health.data.categories.criticalStock.sampleStockIds).not.toContain(thresholdlessStock.id);

    await page.waitForLoadState("networkidle");
    const summary = page.getByTestId("stock-intelligence-summary");
    await summary.waitFor({ state: "visible", timeout: 30_000 });
    await expect(summary).toContainText("Kritik stok 1");
    await page.screenshot({ path: "qa-screenshots/stok-faz2-saglik-sinyalleri.png", fullPage: false });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `STOK FAZ2 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
