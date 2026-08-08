import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "breakpoint", width: 768, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test("customer workspace stays between the global header and composer at every viewport", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `workspace-bounds-${suffix}@metrix.invalid`, fullName: "Workspace Bounds QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `Workspace Bounds QA ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Bounds Customer ${suffix}`, source: "ACCEPTANCE" } });
  const session = await createSession(user.id, false);
  await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);

  try {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      const composerInput = page.getByRole("textbox", { name: "Metrix ile konuş..." });
      await composerInput.fill("Müşterilerimi göster.");
      await page.getByRole("button", { name: "Gönder" }).click();
      const workspace = page.locator('[data-executive-target="living-workspace"]');
      await expect(workspace).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('[data-workspace-frame="centered"]')).toBeVisible();

      const bounds = await page.evaluate(() => {
        const rect = (selector: string) => {
          const node = document.querySelector<HTMLElement>(selector);
          if (!node) throw new Error(`Missing geometry target: ${selector}`);
          return node.getBoundingClientRect().toJSON();
        };
        return {
          header: rect('header[data-global-header="conversation"]'),
          workspace: rect('[data-executive-target="living-workspace"]'),
          frame: rect('[data-workspace-frame="centered"]'),
          composer: rect('[data-conversation-composer]'),
        };
      });
      expect(bounds.header.bottom, `${viewport.name}: header overlaps workspace`).toBeLessThanOrEqual(bounds.workspace.top + 0.5);
      expect(bounds.workspace.bottom, `${viewport.name}: workspace overlaps composer`).toBeLessThanOrEqual(bounds.composer.top + 0.5);
      expect(bounds.frame.left, `${viewport.name}: frame must be inset`).toBeGreaterThan(0);
      expect(bounds.frame.right, `${viewport.name}: frame must be inset`).toBeLessThan(viewport.width);
      await page.screenshot({ path: `qa-screenshots/workspace-frame-${viewport.name}.png`, fullPage: true });
    }
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
