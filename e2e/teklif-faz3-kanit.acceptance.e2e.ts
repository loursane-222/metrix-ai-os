import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createSession } from "@/lib/auth/sessions/session.service";
import { ensurePublicOfferToken } from "@/lib/core/offers/offer-public-link.service";
import { prisma } from "@/lib/core/shared/prisma";

test("teklif faz3 kanit: onay, karsi teklif, bildirim, tekrar karar ve temizlik", async ({ browser, context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `teklif-faz3-${suffix}@metrix.invalid`, fullName: "Teklif Faz 3 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TEKLIF FAZ3 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas ${suffix}`, phone: "+90 532-111-22-33", source: "ACCEPTANCE" } });
    const quoteData = { organizationId: organization.id, customerId: customer.id, customerName: customer.displayName, amount: 12500, currency: "TRY", status: "SENT" as const, sentAt: new Date(), validUntil: new Date(Date.now() + 14 * 86_400_000) };
    const approvedQuote = await prisma.quote.create({ data: { ...quoteData, title: `Onay Teklifi ${suffix}`, items: { create: [{ organizationId: organization.id, name: "Dönüşüm danışmanlığı", unit: "paket", quantity: 1, unitPriceCents: BigInt(1_250_000), lineTotalCents: BigInt(1_250_000), sortOrder: 0 }] } } });
    const counterQuote = await prisma.quote.create({ data: { ...quoteData, title: `Karşı Teklif ${suffix}`, items: { create: [{ organizationId: organization.id, name: "Operasyon paketi", unit: "paket", quantity: 1, unitPriceCents: BigInt(1_250_000), lineTotalCents: BigInt(1_250_000), sortOrder: 0 }] } } });
    const rejectedQuote = await prisma.quote.create({ data: { ...quoteData, title: `Ret Teklifi ${suffix}` } });
    const approvedToken = await ensurePublicOfferToken(approvedQuote.id, organization.id);
    const counterToken = await ensurePublicOfferToken(counterQuote.id, organization.id);
    const rejectedToken = await ensurePublicOfferToken(rejectedQuote.id, organization.id);
    const publicContext = await browser.newContext({ baseURL: "http://127.0.0.1:3118" });
    const publicPage = await publicContext.newPage();

    await publicPage.goto(`/teklif/${approvedToken}`);
    await publicPage.getByRole("button", { name: "Onayla", exact: true }).click();
    await expect(publicPage.getByText("Teklifi onaylamak istiyor musunuz?")).toBeVisible();
    await publicPage.getByRole("button", { name: "Evet, onayla" }).click();
    await expect(publicPage.getByText("Teklifi onayladığınız için teşekkürler, ekibimiz sizinle iletişime geçecek.")).toBeVisible();
    await publicPage.screenshot({ path: "qa-screenshots/teklif-faz3-onayla.png", fullPage: true });
    await expect.poll(async () => (await prisma.quote.findUniqueOrThrow({ where: { id: approvedQuote.id } })).status).toBe("WON");
    expect(await prisma.order.count({ where: { sourceQuoteId: approvedQuote.id } })).toBe(0);
    const repeatedDecision = await publicPage.request.post(`/api/public/offers/${approvedToken}/reject`, { data: { reason: "İkinci sekme" } });
    expect(repeatedDecision.status()).toBe(409);
    expect((await repeatedDecision.json()).error.message).toBe("Bu teklif için karar zaten alınmış.");
    const rejection = await publicPage.request.post(`/api/public/offers/${rejectedToken}/reject`, { data: { reason: "Bütçe bu dönem uygun değil." } });
    expect(rejection.status(), await rejection.text()).toBe(200);
    await expect.poll(async () => prisma.quote.findUnique({ where: { id: rejectedQuote.id }, select: { status: true, lostReason: true } })).toEqual({ status: "LOST", lostReason: "Bütçe bu dönem uygun değil." });
    expect(await prisma.quoteEvent.count({ where: { quoteId: rejectedQuote.id, eventType: "QUOTE_LOST" } })).toBe(1);

    await publicPage.goto(`/teklif/${counterToken}`);
    await publicPage.getByRole("button", { name: "Karşı Teklif Ver" }).click();
    await publicPage.getByLabel("Önerilen tutar").fill("11000");
    await publicPage.getByText("Ödeme koşulu", { exact: true }).locator("input").fill("45 gün");
    await publicPage.getByText("Teslim koşulu", { exact: true }).locator("input").fill("10 iş günü");
    await publicPage.getByText("Mesaj", { exact: true }).locator("textarea").fill("Bütçemize göre değerlendirebilir misiniz?");
    await publicPage.getByRole("button", { name: "Karşı teklifi gönder" }).click();
    await expect(publicPage.getByText("Karşı teklifiniz ekibimize iletildi. Sizinle iletişime geçeceğiz.")).toBeVisible();
    await publicPage.screenshot({ path: "qa-screenshots/teklif-faz3-karsi-teklif.png", fullPage: true });
    await expect.poll(async () => prisma.quoteCounterProposal.findFirst({ where: { quoteId: counterQuote.id } })).not.toBeNull();
    await expect.poll(async () => prisma.notification.findFirst({ where: { organizationId: organization.id, type: "quote.negotiation", body: { contains: "11000.00 TRY" } } })).not.toBeNull();
    await publicContext.close();

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/ai/chat", (route) => {
      const body = [JSON.stringify({ type: "navigation", command: { correlationId: "teklif-faz3-notification", source: "written", route: "/metrix/notifications", expectedSurfaceAuthorityKey: "workspace.notification.page" } }), JSON.stringify({ type: "chunk", content: "Bildirimlerinizi açıyorum." }), JSON.stringify({ type: "done", conversationId: "teklif-faz3-notification", ai: { content: "Bildirimlerinizi açıyorum." } })].join("\n") + "\n";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });
    await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill("Bildirimlerimi aç");
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByText("Bildirimlerinizi açıyorum.", { exact: true })).toBeVisible();
    const reopen = page.getByRole("button", { name: "Bildirimler çalışma alanını aç" });
    if (await reopen.isVisible()) await reopen.click();
    await expect(page.getByText(`Bir ekip üyesi · ${customer.displayName} teklifi onayladı`, { exact: true })).toBeVisible();
    await expect(page.getByText("siparişe çevirebilirsiniz", { exact: false })).toBeVisible();
    await expect(page.getByText("Tutar: 11000.00 TRY", { exact: false })).toBeVisible();
    await expect(page.getByText("Ödeme: 45 gün", { exact: false })).toBeVisible();
    await expect(page.getByText("Mesaj: Bütçemize göre değerlendirebilir misiniz?", { exact: false })).toBeVisible();
    await page.locator('[data-workspace-frame="centered"]').screenshot({ path: "qa-screenshots/teklif-faz3-onay-bildirimi.png" });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `TEKLIF FAZ3 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
