import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("açık görev sohbet komutuyla tamamlanır ve tekrar tamamlama desteklenmez", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `task-command-${suffix}@metrix.invalid`, fullName: "Görev Komut Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TASK COMMAND ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const task = await prisma.task.create({ data: { organizationId: organization.id, title: `Sesli komut görevi ${suffix}`, description: "Görev sesli komut kabul testi", priority: "HIGH", status: "OPEN", createdByUserId: user.id } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/ai/chat", async (route) => { const correlationId = `task-command-${suffix}`; const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/tasks", expectedSurfaceAuthorityKey: "workspace.task.page" } }), JSON.stringify({ type: "chunk", content: "Görevleri açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Görevleri açıyorum." } })].join("\n") + "\n"; await route.fulfill({ status: 200, contentType: "application/x-ndjson", body }); }, { times: 1 });
    await page.route(`**/api/tasks/${task.id}/actions/edit-command`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "complete" } } } } }) }), { times: 1 });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("Görevleri aç"); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    const row = page.locator('[data-canonical-domain="task"] .workspace-record-row', { hasText: task.title }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-task-action-surface="${task.id}"]`); await expect(surface).toBeVisible();
    await composer.fill("görevi tamamla"); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect(surface.getByText("Tamamlandı", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.status).toBe("DONE");
    const unsupported = await page.request.post(`/api/tasks/${task.id}/actions/edit-command`, { data: { utterance: "tamamla", activeTab: "actions" } });
    expect(unsupported.ok()).toBe(true); expect(await unsupported.json()).toMatchObject({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "unsupported" } } } });
    await page.screenshot({ path: "qa-screenshots/gorev-sesli-komutla-tamamlandi.png", fullPage: true });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
