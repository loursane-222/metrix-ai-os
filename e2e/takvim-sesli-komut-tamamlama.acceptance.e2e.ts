import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("takvim zengin oluşturma, taşıma ve çakışma onamasını sohbetle uygular", async ({ context, page }) => {
  test.setTimeout(240_000); const suffix = randomUUID().slice(0, 8); const fullName = `Takvim Üyesi ${suffix}`;
  const user = await prisma.user.create({ data: { phone: `calendar-voice-${suffix}@metrix.invalid`, fullName, onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `CALENDAR VOICE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const conflictStart = new Date(Date.now() + 86_400_000); conflictStart.setHours(14, 0, 0, 0);
    const conflictEnd = new Date(conflictStart.getTime() + 3_600_000);
    const blocker = await prisma.calendarEvent.create({ data: { organizationId: organization.id, title: `Mevcut engel ${suffix}`, startAt: conflictStart, endAt: conflictEnd, blockType: "FOCUS_TIME", status: "CONFIRMED", participants: { create: [{ organizationId: organization.id, memberId: member.id }] }, statusHistory: { create: { organizationId: organization.id, toStatus: "CONFIRMED" } } } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("takvimi göster"); await page.getByRole("button", { name: "Gönder" }).click(); await page.getByRole("heading", { name: "Takvim" }).last().waitFor({ state: "visible", timeout: 30_000 });
    const send = async (text: string) => { await expect(composer).toBeEnabled({ timeout: 120_000 }); await composer.fill(text); await page.getByRole("button", { name: "Gönder" }).click(); await expect(composer).toBeEnabled({ timeout: 120_000 }); };
    const createdTitle = `Sesli toplantı ${suffix}`; await send(`yarın saat 10:00 ${createdTitle} ile ${fullName} ekle`);
    const created = await expect.poll(() => prisma.calendarEvent.findFirst({ where: { organizationId: organization.id, title: createdTitle, blockType: "MEETING", participants: { some: { memberId: member.id } } } }), { timeout: 30_000 }).not.toBeNull();
    const conflictTitle = `Çakışan toplantı ${suffix}`; await send(`yarın saat 10:00 ${conflictTitle} ile ${fullName} ekle`); await expect(page.locator(".calendar-conflict")).toContainText("Takvim çakışması bulundu", { timeout: 30_000 }); await send("çakışmaya rağmen devam et"); await expect.poll(() => prisma.calendarEvent.count({ where: { organizationId: organization.id, title: conflictTitle } })).toBe(1);
    await send(`Mevcut engel ${suffix} etkinliğini yarın saat 18:00'e taşı`); await expect.poll(async () => (await prisma.calendarEvent.findUniqueOrThrow({ where: { id: blocker.id } })).startAt.getHours()).toBe(18);
    await page.screenshot({ path: "qa-screenshots/takvim-sesli-komut-tamamlama.png", fullPage: false });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
