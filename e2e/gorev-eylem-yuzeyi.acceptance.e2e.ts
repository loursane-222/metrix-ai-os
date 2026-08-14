import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("açık görev gerçek eylem yüzeyinden tamamlanır", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `task-action-${suffix}@metrix.invalid`, fullName: "Görev Eylem Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `TASK ACTION ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const task = await prisma.task.create({ data: { organizationId: organization.id, title: `Kabul görevi ${suffix}`, description: "Gerçek görev tamamlama kabul testi", dueDate: new Date("2026-09-15T09:00:00.000Z"), priority: "HIGH", status: "OPEN", createdByUserId: user.id } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.route("**/api/ai/chat", async (route) => {
      const correlationId = `task-action-${suffix}`;
      const body = [
        JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/tasks", expectedSurfaceAuthorityKey: "workspace.task.page" } }),
        JSON.stringify({ type: "chunk", content: "Görevleri açıyorum." }),
        JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Görevleri açıyorum." } }),
      ].join("\n") + "\n";
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });
    await page.goto("/metrix");
    await page.getByRole("textbox", { name: "Metrix ile konuş..." }).fill("Görevleri aç");
    await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="task"] .workspace-record-row', { hasText: task.title });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const surface = page.locator(`[data-task-action-surface="${task.id}"]`);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await expect(surface.getByText("Açık", { exact: true })).toBeVisible();
    await expect(surface.getByText("Yüksek", { exact: true })).toBeVisible();
    await surface.getByRole("button", { name: "Görevi Tamamla" }).click();
    await expect(surface.getByText("Tamamlandı", { exact: true })).toBeVisible();
    await expect(surface.getByRole("button", { name: "Görevi Tamamla" })).toHaveCount(0);
    await expect(surface.getByText("Bu görevde başka aksiyon yok.")).toBeVisible();
    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stored?.status).toBe("DONE");
    await page.screenshot({ path: "qa-screenshots/gorev-tamamlandi-eylem-yuzeyi.png", fullPage: true });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
