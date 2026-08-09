import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { createNewOrder, transitionOrderStatus } from "@/lib/core/orders/order.service";
import { createDeliveryFromOrder } from "@/lib/core/deliveries/delivery.service";
import { recordOrderRevision } from "@/lib/core/orders/order-intelligence.service";

const orderList = '[data-canonical-domain="order"][data-canonical-view="list"]';
const orderDetail = '[data-canonical-domain="order"][data-canonical-view="detail"]';

test("siparis faz2 kanit: operasyonel zeka + revizyon + taahhut + temizlik", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `siparis-faz2-${suffix}@metrix.invalid`, fullName: "Sipariş Faz 2 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `SIPARIS FAZ2 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Faz 2 Müşteri ${suffix}`, source: "ACCEPTANCE" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Operasyon Ürünü ${suffix}`, type: "PRODUCT", unit: "adet", priceCents: BigInt(75_000_00), currency: "TRY" } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId: organization.id, name: "Faz 2 Depo", code: `F2-${suffix}` } });
    await prisma.stock.create({ data: { organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id, quantity: 6, reservedQuantity: 0, status: "AVAILABLE" } });
    const order = await createNewOrder({ organizationId: organization.id, customerId: customer.id, deadlineAt: new Date(Date.now() + 2 * 86_400_000), commitmentAt: new Date(Date.now() + 5 * 86_400_000), items: [{ productServiceId: product.id, name: product.name, unit: "adet", quantity: 10, unitPriceCents: BigInt(75_000_00), lineTotalCents: BigInt(750_000_00) }] });
    expect(order).not.toBeNull();
    const orderId = order!.id;
    for (const toStatus of ["APPROVED", "PLANNED", "IN_PRODUCTION", "READY"] as const) await transitionOrderStatus({ orderId, organizationId: organization.id, toStatus });
    const approved = await prisma.order.findFirst({ where: { id: orderId, organizationId: organization.id } });
    expect(Array.isArray(approved?.reservedInventory)).toBe(true);
    expect((approved?.reservedInventory as unknown[]).length).toBeGreaterThan(0);
    await createDeliveryFromOrder({ organizationId: organization.id, sourceOrderId: orderId, items: [{ orderItemId: order!.items[0]!.id, quantity: 4 }], autoDispatch: true, performedById: user.id });
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe("PARTIALLY_SHIPPED");
    await recordOrderRevision(orderId, organization.id, { changeType: "QUANTITY_CHANGED", orderItemId: order!.items[0]!.id, quantity: 12 }, "Müşteri miktarı artırdı", user.id);

    const commitmentOrder = await prisma.order.create({ data: { organizationId: organization.id, customerId: customer.id, orderNumber: `SIP-C-${suffix}`, status: "SHIPPED", commitmentAt: new Date(Date.now() + 86_400_000) } });
    await prisma.delivery.create({ data: { organizationId: organization.id, sourceOrderId: commitmentOrder.id, customerId: customer.id, deliveryNumber: `IRS-C-${suffix}`, status: "DISPATCHED", dispatchedAt: new Date() } });

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill("siparişlerimizi göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    const targetRow = page.locator(`${orderList} .workspace-record-row`, { hasText: order!.orderNumber });
    await targetRow.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await targetRow.click();
    await page.locator(orderDetail).waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForLoadState("networkidle");

    await expect(page.locator(orderDetail)).toContainText("Karşılama özeti");
    await expect(page.locator(orderDetail)).toContainText("1 kalem kısmi");
    await expect(page.locator(orderDetail)).toContainText("Kısmi rezervasyon");
    await page.screenshot({ path: "qa-screenshots/siparis-faz2-karsilama.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_KARSILAMA");

    await expect(page.locator(orderDetail)).toContainText("Öncelik faktörleri");
    await expect(page.locator(orderDetail)).toContainText(/Stok açığı|Teslim tarihine/);
    await page.screenshot({ path: "qa-screenshots/siparis-faz2-oncelik.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_ONCELIK");

    await expect(page.locator(orderDetail)).toContainText("Revizyon geçmişi");
    await expect(page.locator(orderDetail)).toContainText("Önce:");
    await expect(page.locator(orderDetail)).toContainText("Sonra:");
    await page.screenshot({ path: "qa-screenshots/siparis-faz2-revizyon.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_REVIZYON");

    const commitmentResponse = await page.request.get("/api/orders/intelligence/commitment");
    expect(commitmentResponse.status()).toBe(200);
    const commitment = await commitmentResponse.json() as { ok: boolean; data: { rate: number | null; measuredOrders: number } };
    expect(commitment.data.measuredOrders).toBe(1);
    expect(commitment.data.rate).toBe(100);
    console.info("ACCEPTANCE_COMMITMENT_RATE", commitment.data.rate);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `SIPARIS FAZ2 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
