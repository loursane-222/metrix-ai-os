import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("depo oluşturma, mal kabul ve depo transferi gerçek yüzeylerden tamamlanır", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `stock-surface-${suffix}@metrix.invalid`, fullName: "Stok Yüzeyi QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `STOCK SURFACE ${suffix}`, onboardingStatus: "COMPLETED" } });

  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Pirinç Levha ${suffix}`, type: "PRODUCT", unit: "adet", status: "ACTIVE" } });
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `Metal Tedarik ${suffix}`, status: "ACTIVE" } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill("stok işlemlerini aç");
    await page.getByRole("button", { name: "Gönder" }).click();

    await expect(page.locator('section[aria-label="Çalışma Alanı"]')).toHaveAttribute("aria-hidden", "false", { timeout: 30_000 });
    const surface = page.locator("[data-stock-operation-surface]");
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await expect(composer).toBeEnabled({ timeout: 30_000 });
    await surface.getByRole("tab", { name: /Depolar/ }).click();

    await page.getByLabel("Depo adı").fill("Ana Depo");
    await page.getByLabel("Depo kodu").fill(`ANA-${suffix}`);
    await page.getByLabel("Depo türü").fill("Merkez");
    await page.getByLabel("Adres").fill("İstanbul");
    await page.getByLabel("Notlar").fill("Ana kabul deposu");
    await page.getByRole("button", { name: "Depo oluştur" }).click();
    await expect(page.getByRole("status")).toHaveText("Depo oluşturuldu.");

    await page.getByLabel("Depo adı").fill("Transfer Deposu");
    await page.getByLabel("Depo kodu").fill(`TRF-${suffix}`);
    await page.getByRole("button", { name: "Depo oluştur" }).click();
    await expect(surface.getByText("Transfer Deposu", { exact: true })).toBeVisible();

    const warehouses = await prisma.warehouse.findMany({ where: { organizationId: organization.id }, orderBy: { code: "asc" } });
    expect(warehouses).toHaveLength(2);
    const sourceWarehouse = warehouses.find((item) => item.code === `ANA-${suffix}`)!;
    const destinationWarehouse = warehouses.find((item) => item.code === `TRF-${suffix}`)!;
    expect(sourceWarehouse.address).toBe("İstanbul");

    await page.getByRole("tab", { name: "Mal Kabul" }).click();
    await page.getByLabel("Ürün").selectOption({ label: `${product.name} · adet` });
    await page.getByLabel("Depo").selectOption(sourceWarehouse.id);
    await page.getByLabel("Miktar").fill("25");
    await page.getByLabel("Lot").fill("LOT-42");
    await page.getByLabel("Parti").fill("PARTI-7");
    await page.getByLabel("Seri no").fill("SERIAL-99");
    await page.getByLabel("Konum").fill("A-01-03");
    await expect(page.getByLabel("Tedarikçi").locator(`option[value="${supplier.id}"]`)).toHaveText(supplier.displayName);
    await page.getByLabel("Beklenen tarih").fill("2026-08-20");
    await page.getByLabel("Kalite").selectOption("OK");
    await page.getByLabel("Sebep / açıklama").fill("İlk kabul");
    await page.getByRole("button", { name: "Mal kabulü kaydet" }).click();
    await expect(page.getByRole("status")).toHaveText("Mal kabul kaydedildi.");

    const sourceStock = await prisma.stock.findFirst({ where: { organizationId: organization.id, productServiceId: product.id, warehouseId: sourceWarehouse.id, lot: "LOT-42", batch: "PARTI-7", serialNumber: "SERIAL-99" } });
    expect(sourceStock).not.toBeNull();
    expect(Number(sourceStock?.quantity)).toBe(25);
    expect(sourceStock?.location).toBe("A-01-03");
    const receiptMovement = await prisma.stockMovement.findFirst({ where: { organizationId: organization.id, stockId: sourceStock!.id, movementType: "RECEIPT" } });
    expect(receiptMovement?.supplierId).toBeNull();
    expect(receiptMovement?.unitCostCents).toBeNull();
    expect(receiptMovement?.qualityFlag).toBe("OK");
    expect(receiptMovement?.reason).toBe("İlk kabul");

    await page.getByRole("tab", { name: "Depo Transferi" }).click();
    await page.getByLabel("Ürün").selectOption(product.id);
    await page.getByLabel("Kaynak depo").selectOption(sourceWarehouse.id);
    await page.getByLabel("Hedef depo").selectOption(destinationWarehouse.id);
    await page.getByLabel("Miktar").fill("8");
    await page.getByLabel("Lot").fill("LOT-42");
    await page.getByLabel("Parti").fill("PARTI-7");
    await page.getByLabel("Seri no").fill("SERIAL-99");
    await page.getByLabel("Sebep / açıklama").fill("Şube ikmali");
    await page.getByRole("button", { name: "Transferi tamamla" }).click();
    await expect(page.getByRole("status")).toHaveText("Depo transferi tamamlandı.");
    await page.screenshot({ path: "qa-screenshots/stok-gercek-duzenleme-yuzeyi.png", fullPage: true });

    const [sourceAfter, destinationAfter, movements] = await Promise.all([
      prisma.stock.findUnique({ where: { id: sourceStock!.id } }),
      prisma.stock.findFirst({ where: { organizationId: organization.id, productServiceId: product.id, warehouseId: destinationWarehouse.id, lot: "LOT-42", batch: "PARTI-7", serialNumber: "SERIAL-99" } }),
      prisma.stockMovement.findMany({ where: { organizationId: organization.id, movementType: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } }, orderBy: { createdAt: "asc" } }),
    ]);
    expect(Number(sourceAfter?.quantity)).toBe(17);
    expect(Number(destinationAfter?.quantity)).toBe(8);
    expect(movements.map((item) => item.movementType)).toEqual(["TRANSFER_OUT", "TRANSFER_IN"]);
    expect(movements.every((item) => item.fromWarehouseId === sourceWarehouse.id && item.toWarehouseId === destinationWarehouse.id && item.reason === "Şube ikmali")).toBe(true);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
