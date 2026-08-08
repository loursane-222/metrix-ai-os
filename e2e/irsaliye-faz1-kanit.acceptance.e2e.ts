import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

async function waitForDeliveryListPanel(page: import("@playwright/test").Page) {
  await page.locator('[data-canonical-domain="delivery"][data-canonical-view="list"] .workspace-record-item').first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

test("irsaliye faz1 kanit: liste + siparis-donusum + temizlik", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: { phone: `irsaliye-${suffix}@metrix.invalid`, fullName: "İrsaliye Acceptance QA", onboardingStatus: "COMPLETED" },
  });
  const organization = await prisma.organization.create({
    data: { name: `TESLIMAT ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });
  const customer = await prisma.customer.create({
    data: { organizationId: organization.id, displayName: "Atlas", source: "ACCEPTANCE" },
  });

  const quote = await prisma.quote.create({
    data: {
      organizationId: organization.id,
      customerId: customer.id,
      customerName: "Atlas",
      title: "Atlas İrsaliye Test Teklifi",
      status: "WON",
      currency: "TRY",
      wonAt: new Date(),
      items: {
        create: [
          {
            organizationId: organization.id,
            name: "Test Ürünü",
            quantity: 5,
            unitPriceCents: BigInt(10000_00),
            lineTotalCents: BigInt(50000_00),
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const session = await createSession(user.id, false);

  try {
    await context.addCookies([
      { name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");

    // --- 1. Teklifi siparişe çevir → READY ---
    const convertResp = await page.request.post("/api/orders/from-quote", { data: { quoteId: quote.id } });
    expect(convertResp.status()).toBe(201);
    const convertData = await convertResp.json() as { ok: boolean; data: { order: { id: string; orderNumber: string } } };
    const orderId = convertData.data.order.id;
    const orderNumber = convertData.data.order.orderNumber;
    console.info("ACCEPTANCE_ORDER_CREATED", { orderId, orderNumber });
    await prisma.order.update({ where: { id: orderId }, data: { status: "READY" } });

    // --- 2. Siparişten irsaliye oluştur (DRAFT) ---
    const deliveryResp = await page.request.post("/api/deliveries/from-order", { data: { orderId } });
    expect(deliveryResp.status()).toBe(201);
    const deliveryData = await deliveryResp.json() as { ok: boolean; data: { delivery: { id: string; deliveryNumber: string; status: string } } };
    const deliveryId = deliveryData.data.delivery.id;
    const deliveryNumber = deliveryData.data.delivery.deliveryNumber;
    console.info("ACCEPTANCE_DELIVERY_CREATED", { deliveryId, deliveryNumber, status: deliveryData.data.delivery.status });

    // --- 3. irsaliye-faz1-liste.png: workspace paneli gerçekten render olunca al ---
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill("irsaliyeleri göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    await waitForDeliveryListPanel(page);
    await page.screenshot({ path: "qa-screenshots/irsaliye-faz1-liste.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_LISTE");

    // --- 4. irsaliye-faz1-detay.png: satıra tıklayarak detay ---
    await page.locator('[data-canonical-domain="delivery"] .workspace-record-row').first().click();
    await page.locator('[data-canonical-domain="delivery"][data-canonical-view="detail"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "qa-screenshots/irsaliye-faz1-detay.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_DETAY");

    // API doğrulaması
    const detailResp = await page.request.get(`/api/deliveries/${deliveryId}`);
    expect(detailResp.status()).toBe(200);
    const detailJson = await detailResp.json() as { ok: boolean; data: { delivery: { deliveryNumber: string } } };
    expect(detailJson.data.delivery.deliveryNumber).toBe(deliveryNumber);

    // --- 5. irsaliye-faz1-yeni.png: ikinci sipariş → "siparişi irsaliyeye dönüştür" → DISPATCHED ---
    const quote2 = await prisma.quote.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        customerName: "Atlas",
        title: "Atlas İkinci İrsaliye Teklifi",
        status: "WON",
        currency: "TRY",
        wonAt: new Date(),
        items: {
          create: [
            {
              organizationId: organization.id,
              name: "İkinci Ürün",
              quantity: 3,
              unitPriceCents: BigInt(5000_00),
              lineTotalCents: BigInt(15000_00),
              sortOrder: 0,
            },
          ],
        },
      },
    });
    const conv2 = await page.request.post("/api/orders/from-quote", { data: { quoteId: quote2.id } });
    const conv2Data = await conv2.json() as { ok: boolean; data: { order: { id: string; orderNumber: string } } };
    expect(conv2Data.ok).toBe(true);
    const order2Id = conv2Data.data.order.id;
    const order2Number = conv2Data.data.order.orderNumber;
    await prisma.order.update({ where: { id: order2Id }, data: { status: "READY" } });
    console.info("ACCEPTANCE_ORDER2_CREATED", { order2Id, order2Number });

    // Konuşma uzantısı: sipariş → irsaliyeye dönüştür (autoDispatch=true → DISPATCHED, order sync tetiklenir)
    await composer.fill(`${order2Number} siparişini irsaliyeye dönüştür`);
    await page.getByRole("button", { name: "Gönder" }).click();
    await waitForDeliveryListPanel(page);
    await page.screenshot({ path: "qa-screenshots/irsaliye-faz1-yeni.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_YENI");

    // --- 6. Doğrulama: en az bir DISPATCHED irsaliye, order2 PARTIALLY_SHIPPED/SHIPPED ---
    const deliveries = await prisma.delivery.findMany({ where: { organizationId: organization.id } });
    expect(deliveries.length).toBeGreaterThanOrEqual(2);
    const dispatched = deliveries.filter((d) => d.status === "DISPATCHED");
    expect(dispatched.length).toBeGreaterThanOrEqual(1);
    console.info("ACCEPTANCE_DISPATCHED_COUNT", { dispatched: dispatched.length, total: deliveries.length });

    const order2Final = await prisma.order.findUnique({ where: { id: order2Id } });
    const syncedStatuses = ["PARTIALLY_SHIPPED", "SHIPPED"];
    expect(syncedStatuses).toContain(order2Final?.status);
    console.info("ACCEPTANCE_ORDER2_SYNCED_STATUS", order2Final?.status);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
    const remaining = await prisma.organization.findMany({ where: { name: { contains: `TESLIMAT ACCEPTANCE ${suffix}` } } });
    expect(remaining).toHaveLength(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
