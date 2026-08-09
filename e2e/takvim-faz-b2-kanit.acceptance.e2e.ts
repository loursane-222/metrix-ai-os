import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

function localInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

test("takvim B2: gercek cakisma onayi, musaitlik ve NL sorgusu", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const fullName = `B2 Yönetici ${suffix}`;
  const user = await prisma.user.create({ data: { phone: `takvim-b2-${suffix}@metrix.invalid`, fullName, onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TAKVIM B2 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill("takvimi göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    await page.getByRole("heading", { name: "Takvim" }).last().waitFor({ state: "visible", timeout: 30_000 });

    const startAt = new Date(Date.now() - 10 * 60_000);
    const endAt = new Date(Date.now() + 50 * 60_000);
    const firstTitle = `Odak bloğu ${suffix}`;
    await page.getByRole("button", { name: "+ Olay" }).click();
    await page.getByLabel("Başlık").fill(firstTitle);
    await page.getByLabel("Başlangıç").fill(localInput(startAt));
    await page.getByLabel("Bitiş").fill(localInput(endAt));
    await page.getByLabel("Blok türü").selectOption("FOCUS_TIME");
    await page.getByLabel(fullName).check();
    await page.getByRole("button", { name: "Oluştur" }).click();
    await page.getByText(firstTitle, { exact: true }).last().waitFor({ state: "visible", timeout: 30_000 });

    const secondTitle = `Çakışan görüşme ${suffix}`;
    await page.getByRole("button", { name: "+ Olay" }).click();
    await page.getByLabel("Başlık").fill(secondTitle);
    await page.getByLabel("Başlangıç").fill(localInput(startAt));
    await page.getByLabel("Bitiş").fill(localInput(endAt));
    await page.getByLabel("Blok türü").selectOption("MEETING");
    await expect(page.getByText("Odaklanıyor", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Oluştur" }).click();
    await expect(page.locator(".calendar-conflict")).toContainText("Takvim çakışması bulundu");
    await page.locator(".calendar-conflict").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "qa-screenshots/takvim-faz-b2-cakisma-musaitlik.png", fullPage: false });
    await page.getByRole("button", { name: "Çakışmaya rağmen devam et" }).click();
    await expect.poll(() => prisma.calendarEvent.count({ where: { organizationId: organization.id, title: { in: [firstTitle, secondTitle] }, participants: { some: { memberId: member.id } } } })).toBe(2);

    await composer.fill(`${fullName} şu an müsait mi?`);
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByText(new RegExp(`${fullName} - (Odaklanıyor|Toplantıda)`)).last()).toBeVisible({ timeout: 120_000 });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `TAKVIM B2 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
