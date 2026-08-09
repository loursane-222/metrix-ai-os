import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

async function waitForStockListPanel(page: import("@playwright/test").Page) {
  await page.locator('[data-canonical-domain="stock"][data-canonical-view="list"] .workspace-record-item').first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

async function openStockViaChat(page: import("@playwright/test").Page) {
  const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
  await composer.fill("stoku göster");
  await page.getByRole("button", { name: "Gönder" }).click();
  await waitForStockListPanel(page);
}

test("stok faz1 kanit: liste + transfer + rezervasyon + tuketim + temizlik", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);

  // --- Seed: org, user, products, warehouses, stock ---
  const user = await prisma.user.create({
    data: { phone: `stok-${suffix}@metrix.invalid`, fullName: "Stok Acceptance QA", onboardingStatus: "COMPLETED" },
  });
  const organization = await prisma.organization.create({
    data: { name: `STOK ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });
  const customer = await prisma.customer.create({
    data: { organizationId: organization.id, displayName: "Stok Atlas", source: "ACCEPTANCE" },
  });
  const product = await prisma.productService.create({
    data: { organizationId: organization.id, name: "Test Urunu Stok", type: "PRODUCT", unit: "adet", priceCents: BigInt(10000_00), currency: "TRY" },
  });

  const warehouseA = await prisma.warehouse.create({
    data: { organizationId: organization.id, name: "Depo A", code: `DA-${suffix}` },
  });
  const warehouseB = await prisma.warehouse.create({
    data: { organizationId: organization.id, name: "Depo B", code: `DB-${suffix}` },
  });

  // Initial stock: 100 units in Warehouse A
  const stockA = await prisma.stock.create({
    data: { organizationId: organization.id, productServiceId: product.id, warehouseId: warehouseA.id, quantity: 100, reservedQuantity: 0, status: "AVAILABLE" },
  });
  console.info("ACCEPTANCE_STOCK_SEEDED", { stockId: stockA.id, warehouseId: warehouseA.id, quantity: 100 });

  const session = await createSession(user.id, false);

  try {
    await context.addCookies([
      { name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Ana sayfaya git (redirect zinciri: /metrix → /)
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");

    // --- 1. stok-faz1-liste.png: sohbet komutuyla stok listesini aç ---
    await openStockViaChat(page);
    await page.screenshot({ path: "qa-screenshots/stok-faz1-liste.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_LISTE");

    // --- 2. stok-faz1-detay.png: ilk satıra tıkla ---
    await page.locator('[data-canonical-domain="stock"] .workspace-record-row').first().click();
    await page.locator('[data-canonical-domain="stock"][data-canonical-view="detail"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "qa-screenshots/stok-faz1-detay.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_DETAY");

    // API detay doğrulama
    const detailResp = await page.request.get(`/api/stock/${stockA.id}`);
    expect(detailResp.status()).toBe(200);
    const detailJson = await detailResp.json() as { ok: boolean; data: { stock: { id: string; quantity: string } } };
    expect(detailJson.data.stock.id).toBe(stockA.id);

    // --- 3. Transfer: Depo A → Depo B, 30 adet (API üzerinden) ---
    const transferResp = await page.request.post("/api/stock/transfer", {
      data: { productServiceId: product.id, fromWarehouseId: warehouseA.id, toWarehouseId: warehouseB.id, quantity: 30 },
    });
    expect(transferResp.status()).toBe(200);
    const transferJson = await transferResp.json() as { ok: boolean; data: { source: { quantity: string }; destination: { quantity: string } } };
    expect(parseFloat(transferJson.data.source.quantity)).toBeCloseTo(70, 1);
    expect(parseFloat(transferJson.data.destination.quantity)).toBeCloseTo(30, 1);
    console.info("ACCEPTANCE_TRANSFER_DONE", { sourceQty: transferJson.data.source.quantity, destQty: transferJson.data.destination.quantity });

    // stok-faz1-transfer.png: sohbet komutuyla listeyi yeniden aç → güncel miktarlar görünsün
    await openStockViaChat(page);
    // waitForLoadState("networkidle") in openStockViaChat may resolve before React's useEffect
    // fires the fresh fetch (old rows are rendered immediately from state while the effect is async).
    // Wait for the second record item to confirm post-transfer data (Depo B) has loaded.
    await page.locator('[data-canonical-domain="stock"][data-canonical-view="list"] .workspace-record-item').nth(1).waitFor({ state: "visible", timeout: 10_000 });
    await page.screenshot({ path: "qa-screenshots/stok-faz1-transfer.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_TRANSFER");

    // --- 4. Sipariş → APPROVED → rezervasyon doğrulama ---
    const quote = await prisma.quote.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        customerName: "Stok Atlas",
        title: "Stok Acceptance Teklif",
        status: "WON",
        currency: "TRY",
        wonAt: new Date(),
        items: {
          create: [{
            organizationId: organization.id,
            name: "Test Urunu Stok",
            productServiceId: product.id,
            quantity: 10,
            unitPriceCents: BigInt(10000_00),
            lineTotalCents: BigInt(100000_00),
            sortOrder: 0,
          }],
        },
      },
    });

    const orderResp = await page.request.post("/api/orders/from-quote", { data: { quoteId: quote.id } });
    expect(orderResp.status()).toBe(201);
    const orderData = await orderResp.json() as { ok: boolean; data: { order: { id: string; orderNumber: string } } };
    const orderId = orderData.data.order.id;
    console.info("ACCEPTANCE_ORDER_CREATED", { orderId, orderNumber: orderData.data.order.orderNumber });

    // APPROVED durumuna geç → rezervasyon tetiklenir
    const approveResp = await page.request.patch(`/api/orders/${orderId}`, { data: { toStatus: "APPROVED" } });
    expect(approveResp.status()).toBe(200);

    // reservedInventory dolu mu?
    const orderAfterApprove = await prisma.order.findUnique({ where: { id: orderId } });
    expect(orderAfterApprove?.status).toBe("APPROVED");
    const reservedInventory = orderAfterApprove?.reservedInventory as { productServiceId: string; reserved: number }[] | null;
    expect(reservedInventory).not.toBeNull();
    expect(Array.isArray(reservedInventory)).toBe(true);
    expect((reservedInventory ?? []).length).toBeGreaterThanOrEqual(1);
    console.info("ACCEPTANCE_RESERVATION_DONE", { reservedInventory });

    // reservedQuantity arttı mı?
    const stockAfterReserve = await prisma.stock.findFirst({ where: { organizationId: organization.id, warehouseId: warehouseA.id, productServiceId: product.id } });
    expect(Number(stockAfterReserve?.reservedQuantity)).toBeGreaterThan(0);
    console.info("ACCEPTANCE_RESERVED_QTY", { reservedQuantity: stockAfterReserve?.reservedQuantity?.toString() });

    // --- 5. İrsaliye oluştur → DISPATCHED → stok düşümü doğrulama ---
    const stockBeforeConsume = await prisma.stock.findFirst({ where: { organizationId: organization.id, warehouseId: warehouseA.id, productServiceId: product.id } });
    const qtyBeforeConsume = Number(stockBeforeConsume?.quantity ?? 0);

    await prisma.order.update({ where: { id: orderId }, data: { status: "READY" } });
    const deliveryResp = await page.request.post("/api/deliveries/from-order", { data: { orderId, autoDispatch: true } });
    expect(deliveryResp.status()).toBe(201);
    const deliveryData = await deliveryResp.json() as { ok: boolean; data: { delivery: { id: string; status: string } } };
    expect(deliveryData.data.delivery.status).toBe("DISPATCHED");
    console.info("ACCEPTANCE_DELIVERY_DISPATCHED", { deliveryId: deliveryData.data.delivery.id });

    const stockAfterConsume = await prisma.stock.findFirst({ where: { organizationId: organization.id, warehouseId: warehouseA.id, productServiceId: product.id } });
    const qtyAfterConsume = Number(stockAfterConsume?.quantity ?? 0);
    expect(qtyAfterConsume).toBeLessThan(qtyBeforeConsume);
    console.info("ACCEPTANCE_CONSUME_DONE", { before: qtyBeforeConsume, after: qtyAfterConsume, consumed: qtyBeforeConsume - qtyAfterConsume });

  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
    const remaining = await prisma.organization.findMany({ where: { name: { contains: `STOK ACCEPTANCE ${suffix}` } } });
    expect(remaining).toHaveLength(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
