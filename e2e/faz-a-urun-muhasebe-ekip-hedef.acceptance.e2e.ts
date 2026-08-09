import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

async function submitChat(page: Page, message: string): Promise<void> {
  const composer = page.locator("[data-conversation-composer] textarea");
  await composer.waitFor({ state: "visible", timeout: 60_000 });
  await expect(composer).toBeEnabled({ timeout: 120_000 });
  await composer.fill(message);
  await page.getByRole("button", { name: "Gönder" }).click();
}

async function returnToChat(page: Page): Promise<void> {
  const back = page.getByRole("button", { name: "Sohbete dön" });
  await back.waitFor({ state: "visible", timeout: 30_000 });
  await back.click();
}

async function capture(locator: Locator, path: string): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: 30_000 });
  await locator.page().waitForLoadState("networkidle");
  await locator.screenshot({ path });
}

test("faz A kanit: urun + muhasebe + ekip + hedef sohbet baglantisi ve temizlik", async ({ context, page }) => {
  test.setTimeout(300_000);
  const suffix = randomUUID().slice(0, 8);
  const invitedEmail = `faz-a-member-${suffix}@metrix.invalid`;
  const user = await prisma.user.create({ data: { phone: `faz-a-owner-${suffix}@metrix.invalid`, fullName: "Faz A Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `FAZ-A ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Faz A Ürünü ${suffix}`, type: "PRODUCT", category: "Acceptance", priceCents: BigInt(125_000), currency: "TRY" } });
    const goal = await prisma.salesGoal.create({ data: { organizationId: organization.id, title: `Faz A Gelir Hedefi ${suffix}`, period: "MONTHLY", targetRevenueCents: BigInt(5_000_000), actualValue: 12500, forecastValue: 48000, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000) } });
    await prisma.expense.create({ data: { organizationId: organization.id, title: `Faz A Gideri ${suffix}`, category: "SOFTWARE", amount: 2500, currency: "TRY", expenseDate: new Date(), status: "PENDING" } });

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");

    await submitChat(page, "urunleri goster");
    const productSurface = page.locator('[data-canonical-domain="product"][data-canonical-view="list"]');
    await expect(productSurface).toContainText(product.name, { timeout: 30_000 });
    await capture(productSurface, "qa-screenshots/faz-a-urun-listesi.png");

    await returnToChat(page);
    await submitChat(page, "muhasebe ozetini goster");
    const accountingSurface = page.locator('[aria-label="Çalışma Alanı"]');
    await expect(page.getByText("Kaynak kayıtlar: 0 fatura, 0 tahsilat, 1 gider.")).toBeVisible({ timeout: 30_000 });
    await capture(accountingSurface, "qa-screenshots/faz-a-muhasebe-ozeti.png");

    await returnToChat(page);
    await submitChat(page, `${invitedEmail}'i yonetici olarak davet et`);
    const teamSurface = page.locator('[data-canonical-domain="team"][data-canonical-view="list"]');
    await expect(teamSurface).toContainText(invitedEmail, { timeout: 30_000 });
    await expect(teamSurface).toContainText("MANAGER");
    await capture(teamSurface, "qa-screenshots/faz-a-ekip-davet.png");

    await returnToChat(page);
    await submitChat(page, `${invitedEmail}'in rolunu ekip lideri yap`);
    await expect.poll(async () => (await prisma.organizationMember.findFirst({ where: { organizationId: organization.id, user: { phone: invitedEmail } } }))?.role).toBe("TEAM_LEAD");

    await returnToChat(page);
    await submitChat(page, "hedeflerimizi goster");
    const goalSurface = page.locator('[data-canonical-domain="goal"][data-canonical-view="list"]');
    await expect(goalSurface).toContainText(goal.title, { timeout: 30_000 });
    await capture(goalSurface, "qa-screenshots/faz-a-hedef-listesi.png");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { phone: { in: [user.phone, invitedEmail] } } });
    expect(await prisma.organization.count({ where: { name: { contains: `FAZ-A ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
