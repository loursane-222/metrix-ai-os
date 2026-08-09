import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createSession } from "@/lib/auth/sessions/session.service";
import { ensurePublicOfferToken } from "@/lib/core/offers/offer-public-link.service";
import { prisma } from "@/lib/core/shared/prisma";

test("teklif faz4 kanit: gercek sinyaller ve yetersiz veri kapisi", async ({ browser, context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `teklif-faz4-${suffix}@metrix.invalid`, fullName: "Teklif Faz 4 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TEKLIF FAZ4 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas ${suffix}`, source: "ACCEPTANCE" } });
    const sparseCustomer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Nova ${suffix}`, source: "ACCEPTANCE" } });
    const sentAt = new Date("2026-07-01T09:00:00Z");
    const won = await prisma.quote.create({ data: { organizationId: organization.id, customerId: customer.id, customerName: customer.displayName, title: "Geçmiş Kazanılan", amount: 20000, status: "WON", sentAt, wonAt: new Date("2026-07-03T09:00:00Z") } });
    const lost = await prisma.quote.create({ data: { organizationId: organization.id, customerId: customer.id, customerName: customer.displayName, title: "Geçmiş Kaybedilen", amount: 15000, status: "LOST", sentAt, lostAt: new Date("2026-07-05T09:00:00Z") } });
    await prisma.quoteCounterProposal.createMany({ data: [
      { organizationId: organization.id, quoteId: won.id, proposedAmount: 18000, message: "Fiyatı değerlendirelim" },
      { organizationId: organization.id, quoteId: lost.id, proposedAmount: 13000, proposedPaymentTerm: "45 gün" },
    ] });
    await prisma.payment.create({ data: { organizationId: organization.id, customerId: customer.id, title: "Gecikmiş ödeme", amount: 2500, status: "OVERDUE" } });
    const current = await prisma.quote.create({ data: { organizationId: organization.id, customerId: customer.id, customerName: customer.displayName, title: `Sinyal Teklifi ${suffix}`, amount: 12000, status: "SENT", sentAt: new Date() } });
    await prisma.quote.create({ data: { organizationId: organization.id, customerId: sparseCustomer.id, customerName: sparseCustomer.displayName, title: "Tek geçmiş karar", amount: 5000, status: "WON", sentAt, wonAt: new Date("2026-07-02T09:00:00Z") } });
    const sparseCurrent = await prisma.quote.create({ data: { organizationId: organization.id, customerId: sparseCustomer.id, customerName: sparseCustomer.displayName, title: `Yetersiz Veri ${suffix}`, amount: 6000, status: "DRAFT" } });

    const token = await ensurePublicOfferToken(current.id, organization.id);
    const publicContext = await browser.newContext({ baseURL: "http://127.0.0.1:3119" });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/teklif/${token}`);
    await expect.poll(() => prisma.quoteEvent.count({ where: { quoteId: current.id, eventType: "QUOTE_VIEWED" } })).toBe(1);
    await publicPage.reload();
    await expect.poll(() => prisma.quoteEvent.count({ where: { quoteId: current.id, eventType: "QUOTE_VIEWED" } })).toBe(2);
    await publicPage.reload();
    await expect.poll(() => prisma.quoteEvent.count({ where: { quoteId: current.id, eventType: "QUOTE_VIEWED" } })).toBe(3);
    await publicContext.close();

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const openOffer = async (quoteId: string, correlationId: string) => {
      await page.route("**/api/ai/chat", (route) => {
        const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: `/metrix/offers/${quoteId}/edit`, expectedSurfaceAuthorityKey: "offers.edit.page" } }), JSON.stringify({ type: "chunk", content: "Teklifi açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Teklifi açıyorum." } })].join("\n") + "\n";
        return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
      }, { times: 1 });
      await page.goto("/metrix");
      const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
      await composer.fill("Teklifi aç");
      await page.getByRole("button", { name: "Gönder" }).click();
      await expect(page.getByText("Teklifi açıyorum.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sinyal" })).toBeVisible();
    };
    await openOffer(current.id, "teklif-faz4-rich");
    await page.getByRole("button", { name: "Sinyal" }).click();
    await expect(page.getByText("Görüntülenme:").locator(".."), "view count").toContainText("3");
    await expect(page.getByText("Kazanma olasılığı:").locator(".."), "win probability").toContainText("%50");
    await expect(page.getByText("Fiyat Odaklı", { exact: true })).toBeVisible();
    await expect(page.getByText("Gecikmiş ödeme:").locator(".."), "financial risk").toContainText("1");
    await expect(page.getByText("Hesaplanamıyor: Kârlılık", { exact: false })).toBeVisible();
    await page.screenshot({ path: "qa-screenshots/teklif-faz4-sinyal.png", fullPage: true });

    await openOffer(sparseCurrent.id, "teklif-faz4-sparse");
    await page.getByRole("button", { name: "Sinyal" }).click();
    await expect(page.getByText("Yetersiz veri — henüz yeterli teklif geçmişi yok", { exact: true })).toBeVisible();
    const response = await page.request.get(`/api/quotes/${sparseCurrent.id}/intelligence`);
    expect((await response.json()).data.customerScorecard).toMatchObject({ sufficientData: false, sampleSize: 1 });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `TEKLIF FAZ4 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
