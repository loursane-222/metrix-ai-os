import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("siparis faz1 kanit: liste + donusum + temizlik", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: { phone: `siparis-${suffix}@metrix.invalid`, fullName: "Sipariş Acceptance QA", onboardingStatus: "COMPLETED" },
  });
  const organization = await prisma.organization.create({
    data: { name: `SIPARIS ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" },
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
      title: "Atlas Yıllık Hizmet Teklifi",
      status: "WON",
      currency: "TRY",
      wonAt: new Date(),
      items: {
        create: [
          {
            organizationId: organization.id,
            name: "Danışmanlık hizmeti",
            quantity: 1,
            unitPriceCents: BigInt(50000_00),
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

    // --- 1. Teklifi siparişe çevir (API ile) ---
    const convertResp = await page.request.post("/api/orders/from-quote", {
      data: { quoteId: quote.id },
    });
    const convertBody = await convertResp.text();
    console.info("ACCEPTANCE_CONVERT_STATUS", convertResp.status(), convertBody.slice(0, 500));
    expect(convertResp.status()).toBe(201);
    const convertData = JSON.parse(convertBody) as { ok: boolean; data: { order: { id: string; orderNumber: string } } };
    expect(convertData.ok).toBe(true);
    const orderId = convertData.data.order.id;
    const orderNumber = convertData.data.order.orderNumber;
    console.info("ACCEPTANCE_ORDER_CREATED", { orderId, orderNumber });

    // --- 2. siparis-faz1-liste.png: siparişler listesi ---
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill("siparişlerimizi göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    // Çalışma alanı panelinin ve gerçek sipariş kaydının DOM'da render olmasını bekle
    await page.waitForSelector('[data-canonical-domain="order"][data-canonical-view="list"] .workspace-record-item', { timeout: 20_000 });
    await page.screenshot({ path: "qa-screenshots/siparis-faz1-liste.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_LISTE");

    // --- 3. siparis-faz1-detay.png: sipariş satırına tıklayarak detay görünümü ---
    await page.locator('[data-canonical-domain="order"] .workspace-record-row').first().click();
    await page.waitForSelector('[data-canonical-domain="order"][data-canonical-view="detail"]', { timeout: 10_000 });
    await page.screenshot({ path: "qa-screenshots/siparis-faz1-detay.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_DETAY");

    // API doğrulaması: detay verisi doğru dönüyor
    const detailResp = await page.request.get(`/api/orders/${orderId}`);
    expect(detailResp.status()).toBe(200);
    const detailData = await detailResp.json() as { ok: boolean; data: { order: { orderNumber: string; status: string } } };
    expect(detailData.ok).toBe(true);
    expect(detailData.data.order.orderNumber).toBe(orderNumber);
    console.info("ACCEPTANCE_ORDER_DETAIL", detailData.data.order);

    // --- 4. siparis-faz1-yeni.png: "Atlas teklifini siparişe çevir" konuşma komutu ---
    // İkinci bir WON teklif oluştur (ilki zaten siparişe dönüştü — unique constraint)
    const quote2 = await prisma.quote.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        customerName: "Atlas",
        title: "Atlas İkinci Teklif",
        status: "WON",
        currency: "TRY",
        wonAt: new Date(),
      },
    });
    console.info("ACCEPTANCE_QUOTE2_CREATED", { quoteId: quote2.id });

    // Conversation extension üzerinden "Atlas teklifini siparişe çevir" komutu
    await composer.fill("Atlas teklifini siparişe çevir");
    await page.getByRole("button", { name: "Gönder" }).click();
    // Çalışma alanı panelinin listeye döndüğünü ve yeni siparişin göründüğünü bekle
    await page.waitForSelector('[data-canonical-domain="order"][data-canonical-view="list"] .workspace-record-item', { timeout: 20_000 });
    await page.screenshot({ path: "qa-screenshots/siparis-faz1-yeni.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_YENI");

    // --- 5. Son doğrulama: DB'de siparişler gerçekten oluştu ---
    const orders = await prisma.order.findMany({ where: { organizationId: organization.id } });
    expect(orders.length).toBeGreaterThanOrEqual(1);
    console.info("ACCEPTANCE_ORDERS_FINAL_COUNT", { count: orders.length });
  } finally {
    // --- 6. Temizlik ---
    await prisma.organization.delete({ where: { id: organization.id } });
    const remaining = await prisma.organization.findMany({ where: { name: { contains: `SIPARIS ACCEPTANCE ${suffix}` } } });
    expect(remaining).toHaveLength(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
