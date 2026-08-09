import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

async function capture(page: Page, path: string): Promise<void> {
  const workspace = page.getByRole("heading", { name: "Takvim" }).last();
  await page.waitForLoadState("networkidle");
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path, fullPage: false });
}

test("takvim faz1 kanit: gorunumler, olusturma, surukleme, odunc veriler ve temizlik", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `takvim-${suffix}@metrix.invalid`, fullName: "Takvim Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TAKVIM FAZ1 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  const today = new Date(); today.setHours(10, 0, 0, 0);
  const endAt = new Date(today.getTime() + 3_600_000);
  const borrowedDue = new Date(today); borrowedDue.setDate(borrowedDue.getDate() + 1); borrowedDue.setHours(15, 0, 0, 0);
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    await prisma.calendarEvent.create({ data: { organizationId: organization.id, title: `Gerçek yönetim toplantısı ${suffix}`, startAt: today, endAt, status: "CONFIRMED", statusHistory: { create: { organizationId: organization.id, toStatus: "CONFIRMED" } } } });
    await prisma.calendarEvent.create({ data: { organizationId: organization.id, title: `Tüm gün planı ${suffix}`, startAt: today, endAt, allDay: true, status: "PLANNED", statusHistory: { create: { organizationId: organization.id, toStatus: "PLANNED" } } } });
    await prisma.task.create({ data: { organizationId: organization.id, title: `Ödünç görev vadesi ${suffix}`, dueDate: borrowedDue } });
    await prisma.invoice.create({ data: { organizationId: organization.id, invoiceNumber: `KNT-${suffix}`, title: `Ödünç fatura vadesi ${suffix}`, amount: 1000, taxAmount: 200, totalAmount: 1200, dueDate: borrowedDue } });
    await prisma.payment.create({ data: { organizationId: organization.id, title: `Ödünç tahsilat vadesi ${suffix}`, amount: 1200, dueDate: borrowedDue } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill("takvimi göster");
    await page.getByRole("button", { name: "Gönder" }).click();

    await expect(page.getByText(`Gerçek yönetim toplantısı ${suffix}`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(composer).toBeEnabled({ timeout: 120_000 });
    await capture(page, "qa-screenshots/takvim-faz1-ay-gorunumu.png");
    await expect(page.getByText(`Ödünç görev vadesi ${suffix}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Ödünç fatura vadesi ${suffix}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Ödünç tahsilat vadesi ${suffix}`, { exact: true }).first()).toBeVisible();
    await capture(page, "qa-screenshots/takvim-faz1-odunc-veri-regresyon.png");

    await page.getByRole("button", { name: "Hafta", exact: true }).click();
    await page.getByText(`Gerçek yönetim toplantısı ${suffix}`, { exact: true }).first().waitFor({ state: "visible" });
    await capture(page, "qa-screenshots/takvim-faz1-hafta-gorunumu.png");
    await page.getByRole("button", { name: "Gün", exact: true }).click();
    await page.getByText(`Gerçek yönetim toplantısı ${suffix}`, { exact: true }).waitFor({ state: "visible" });
    await capture(page, "qa-screenshots/takvim-faz1-gun-gorunumu.png");

    await page.getByRole("button", { name: "+ Olay" }).click();
    const createdTitle = `Formdan olay ${suffix}`;
    await page.getByLabel("Başlık").fill(createdTitle);
    await page.getByRole("button", { name: "Oluştur" }).click();
    await page.getByText(createdTitle, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await capture(page, "qa-screenshots/takvim-faz1-olay-olusturma.png");

    await page.getByRole("button", { name: "Ay", exact: true }).click();
    const source = page.locator('.calendar-item[draggable="true"]').filter({ hasText: `Gerçek yönetim toplantısı ${suffix}` });
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const target = page.locator(`.calendar-days > button:has(time:text-is("${tomorrow.getDate()}"))`).first();
    await source.waitFor({ state: "visible" });
    await target.waitFor({ state: "visible" });
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await source.dispatchEvent("dragstart", { dataTransfer });
    await target.dispatchEvent("dragover", { dataTransfer });
    await target.dispatchEvent("drop", { dataTransfer });
    await expect.poll(async () => (await prisma.calendarEvent.findFirstOrThrow({ where: { organizationId: organization.id, title: `Gerçek yönetim toplantısı ${suffix}` } })).startAt.getDate()).toBe(tomorrow.getDate());
    await target.click();
    await expect(page.getByText(`Gerçek yönetim toplantısı ${suffix}`, { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await capture(page, "qa-screenshots/takvim-faz1-surukle-yeniden-planlama.png");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `TAKVIM FAZ1 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
