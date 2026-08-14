import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("hedef oluşturma ve düzenleme yüzeyleri gerçek kaydı yönetir", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `goal-surface-${suffix}@metrix.invalid`, fullName: "Hedef Yüzeyi Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `GOAL SURFACE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/ai/chat", async (route) => { const correlationId = `goal-create-${suffix}`; const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/goals/new", expectedSurfaceAuthorityKey: "goals.create.page" } }), JSON.stringify({ type: "chunk", content: "Yeni hedef ekranını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Yeni hedef ekranını açıyorum." } })].join("\n") + "\n"; await route.fulfill({ status: 200, contentType: "application/x-ndjson", body }); }, { times: 1 });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("yeni hedef ekranını aç"); await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.locator("[data-goal-create-surface]")).toBeVisible({ timeout: 30_000 });
    const title = `Büyüme Hedefi ${suffix}`; await page.getByLabel("Başlık").fill(title); await page.getByLabel("Dönem").selectOption("QUARTERLY"); await page.getByLabel("Hedef gelir (₺)").fill("125000.50"); await page.getByLabel("Hedef tahsilat (₺)").fill("90000"); await page.getByRole("button", { name: "Hedefi oluştur" }).click();
    await expect(page.locator("[data-goal-edit-surface]")).toBeVisible({ timeout: 30_000 });
    const created = await prisma.salesGoal.findFirstOrThrow({ where: { organizationId: organization.id, title } }); expect(created.period).toBe("QUARTERLY"); expect(created.targetRevenueCents).toBe(BigInt("12500050"));
    await page.getByLabel("Hedef gelir (₺)").fill("140000"); await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click(); await expect(page.getByRole("status")).toHaveText("Hedef bilgileri kaydedildi.");
    await page.getByLabel("Başlık").fill("Kaydedilmemesi gereken hedef"); await page.getByRole("button", { name: "Geri al" }).click(); await expect(page.getByLabel("Başlık")).toHaveValue(title);
    await page.screenshot({ path: "qa-screenshots/hedef-olusturma-ve-duzenleme.png", fullPage: true });
    await page.getByRole("button", { name: "Hedefi iptal et" }).click(); await expect(page.getByRole("status")).toHaveText("Hedef iptal edildi."); await expect(page.getByRole("button", { name: "Hedefi iptal et" })).toBeDisabled();
    await page.screenshot({ path: "qa-screenshots/hedef-iptal.png", fullPage: true });
    const stored = await prisma.salesGoal.findUniqueOrThrow({ where: { id: created.id } }); expect(stored.targetRevenueCents).toBe(BigInt("14000000")); expect(stored.title).toBe(title); expect(stored.status).toBe("CANCELLED");
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
