import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { refreshSupplierIntelligence } from "@/lib/core/suppliers/supplier-intelligence.service";

const supplierListRow = '[data-canonical-domain="supplier"][data-canonical-view="list"] .workspace-record-item';
const supplierDetail = '[data-canonical-domain="supplier"][data-canonical-view="detail"]';

async function submitChat(page: import("@playwright/test").Page, message: string) {
  const composer = page.locator("[data-conversation-composer] textarea");
  await composer.waitFor({ state: "visible", timeout: 60_000 });
  await expect(composer).toBeEnabled({ timeout: 60_000 });
  await composer.fill(message);
  await page.getByRole("button", { name: "Gönder" }).click();
}

test("tedarikci faz2 kanit: performans + alternatif + temizlik", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `tedarikci-faz2-${suffix}@metrix.invalid`, fullName: "Tedarikçi Faz 2 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TEDARIKCI FAZ2 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Çelik Levha ${suffix}`, type: "PRODUCT", unit: "adet" } });
  const warehouse = await prisma.warehouse.create({ data: { organizationId: organization.id, name: "Ana Depo", code: `ANA-${suffix}` } });
  const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `ABC Metal ${suffix}`, riskNotes: "Döviz kuru dalgalanması riski yüksek" } });
  const alternative = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `Alternatif Metal ${suffix}` } });
  await prisma.supplierProduct.createMany({ data: [
    { organizationId: organization.id, supplierId: supplier.id, productServiceId: product.id },
    { organizationId: organization.id, supplierId: alternative.id, productServiceId: product.id },
  ] });
  const now = Date.now();
  const stock = await prisma.stock.create({ data: { organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id, quantity: 100, status: "AVAILABLE" } });
  await prisma.stockMovement.createMany({ data: [
    { organizationId: organization.id, stockId: stock.id, supplierId: supplier.id, sourceType: "SUPPLIER", sourceId: supplier.id, movementType: "RECEIPT", quantity: 60, expectedAt: new Date(now + 86_400_000), unitCostCents: BigInt(10_000), qualityFlag: "OK", createdAt: new Date(now - 1_000) },
    { organizationId: organization.id, stockId: stock.id, supplierId: supplier.id, sourceType: "SUPPLIER", sourceId: supplier.id, movementType: "RECEIPT", quantity: 30, expectedAt: new Date(now - 172_800_000), unitCostCents: BigInt(11_000), qualityFlag: "PARTIAL", createdAt: new Date(now) },
    { organizationId: organization.id, stockId: stock.id, supplierId: supplier.id, sourceType: "SUPPLIER", sourceId: supplier.id, movementType: "RECEIPT", quantity: 10, expectedAt: new Date(now), unitCostCents: BigInt(10_500), qualityFlag: "DAMAGED", createdAt: new Date(now + 1_000) },
  ] });
  await refreshSupplierIntelligence(supplier.id, organization.id);
  const session = await createSession(user.id, false);

    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");

    await submitChat(page, "tedarikçileri göster");
    await page.locator(supplierListRow).first().waitFor({ state: "visible", timeout: 20_000 });
    await page.locator('[data-canonical-domain="supplier"] .workspace-record-row', { hasText: supplier.displayName }).click();
    await page.locator(supplierDetail).waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator(supplierDetail)).toContainText("Score");
    await expect(page.locator(supplierDetail)).toContainText("On Time Delivery Rate");
    await page.screenshot({ path: "qa-screenshots/tedarikci-faz2-performans.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_PERFORMANS");

    await page.getByRole("button", { name: "Sohbete dön" }).click();
    await submitChat(page, `${product.name} için başka tedarikçi öner`);
    await expect(page.locator("[data-conversation-composer] textarea")).toBeEnabled({ timeout: 120_000 });
    await submitChat(page, "tedarikçileri göster");
    await expect(page.locator(supplierListRow).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-canonical-domain="supplier"]:visible')).toContainText(alternative.displayName);
    await page.screenshot({ path: "qa-screenshots/tedarikci-faz2-alternatif.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_ALTERNATIF");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `TEDARIKCI FAZ2 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
