import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createSession } from "@/lib/auth/sessions/session.service";
import { ensurePublicOfferToken } from "@/lib/core/offers/offer-public-link.service";
import { prisma } from "@/lib/core/shared/prisma";

test("teklif faz2 kanit: girissiz sayfa, goruntuleme, bildirim, whatsapp ve temizlik", async ({ browser, context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `teklif-faz2-${suffix}@metrix.invalid`, fullName: "Teklif Faz 2 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TEKLIF FAZ2 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas ${suffix}`, phone: "+90 532-111-22-33", source: "ACCEPTANCE" } });
    const quote = await prisma.quote.create({ data: { organizationId: organization.id, customerId: customer.id, customerName: customer.displayName, title: `Dijital Dönüşüm Teklifi ${suffix}`, amount: 12500, currency: "TRY", status: "SENT", sentAt: new Date(), customerNote: "Birlikte güçlü bir başlangıç için hazırlandı.", paymentTerm: "30 gün", deliveryTerm: "Sözleşmeden sonra 14 gün", deliveryMethod: "Dijital teslim", validUntil: new Date(Date.now() + 14 * 86_400_000), items: { create: [{ organizationId: organization.id, name: "Dönüşüm danışmanlığı", unit: "paket", quantity: 1, unitPriceCents: BigInt(1_250_000), lineTotalCents: BigInt(1_250_000), sortOrder: 0 }] } } });
    const token = await ensurePublicOfferToken(quote.id, organization.id);

    const publicContext = await browser.newContext({ baseURL: "http://127.0.0.1:3117" });
    const publicPage = await publicContext.newPage();
    expect(await publicContext.cookies()).toHaveLength(0);
    const publicApiResponse = await publicPage.request.get(`/api/public/offers/${token}`);
    expect(publicApiResponse.status(), await publicApiResponse.text()).toBe(200);
    await publicPage.goto(`/teklif/${token}`);
    await publicPage.waitForLoadState("networkidle");
    await publicPage.getByRole("heading", { name: quote.title }).waitFor({ state: "visible", timeout: 30_000 });
    await expect(publicPage.getByText(organization.name, { exact: true })).toBeVisible();
    await expect(publicPage.getByText("Dönüşüm danışmanlığı", { exact: true })).toBeVisible();
    await publicPage.screenshot({ path: "qa-screenshots/teklif-faz2-genel-sayfa.png", fullPage: true });
    await expect.poll(async () => (await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("VIEWED");
    expect(await prisma.quoteEvent.count({ where: { quoteId: quote.id, eventType: "QUOTE_VIEWED" } })).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => prisma.notification.findFirst({ where: { organizationId: organization.id, recipientUserId: user.id, type: "quote.viewed" } })).not.toBeNull();
    const invalidResponse = await publicPage.request.get("/api/public/offers/gecersiz-token");
    expect(invalidResponse.status()).toBe(404);
    await publicContext.close();

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/ai/chat", (route) => {
      const body = [
        JSON.stringify({ type: "navigation", command: { correlationId: "teklif-faz2-notification", source: "written", route: "/metrix/notifications", expectedSurfaceAuthorityKey: "workspace.notification.page" } }),
        JSON.stringify({ type: "chunk", content: "Bildirimlerinizi açıyorum." }),
        JSON.stringify({ type: "done", conversationId: "teklif-faz2-notification", ai: { content: "Bildirimlerinizi açıyorum." } }),
      ].join("\n") + "\n";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });
    await page.goto("/metrix");
    const notificationComposer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await notificationComposer.fill("Bildirimlerimi aç");
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByText("Bildirimlerinizi açıyorum.", { exact: true })).toBeVisible();
    const reopenNotifications = page.getByRole("button", { name: "Bildirimler çalışma alanını aç" });
    if (await reopenNotifications.isVisible()) await reopenNotifications.click();
    await page.getByText(`${customer.displayName} teklifinizi görüntüledi`, { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-workspace-frame="centered"]').screenshot({ path: "qa-screenshots/teklif-faz2-goruntulenme-bildirimi.png" });

    await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp doğrulama</title>" }));
    await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    const popupPromise = page.waitForEvent("popup");
    await composer.fill(`${customer.displayName} teklifini whatsapp'tan gönder`);
    await page.getByRole("button", { name: "Gönder" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toMatch(/^https:\/\/wa\.me\/905321112233\?text=/u);
    const message = new URL(popup.url()).searchParams.get("text") ?? "";
    expect(message).toContain(quote.title);
    expect(message).toContain("/teklif/");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `TEKLIF FAZ2 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
