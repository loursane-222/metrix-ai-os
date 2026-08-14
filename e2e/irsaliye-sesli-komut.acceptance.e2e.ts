import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { createNewDelivery } from "@/lib/core/deliveries/delivery.service";

test("açık irsaliye yüzeyi sohbet komutuyla kalem durumunu değiştirir", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `delivery-voice-${suffix}@metrix.invalid`, fullName: "İrsaliye Komut Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `DELIVERY COMMAND ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Komut Müşterisi ${suffix}`, source: "ACCEPTANCE" } });
    const order = await prisma.order.create({ data: { organizationId: organization.id, customerId: customer.id, orderNumber: `SIP-DEL-CMD-${suffix}`, status: "READY", items: { create: [{ organizationId: organization.id, name: `Kırılabilir ürün ${suffix}`, unit: "koli", quantity: 5, unitPriceCents: BigInt(100_00), lineTotalCents: BigInt(500_00) }] } }, include: { items: true } });
    const delivery = await createNewDelivery({ organizationId: organization.id, sourceOrderId: order.id, customerId: customer.id, items: [{ orderItemId: order.items[0]!.id, name: order.items[0]!.name, unit: "koli", quantity: 5 }] });
    const deliveryItemId = delivery!.items[0]!.id;
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route(`**/api/deliveries/${delivery!.id}/actions/edit-command`, async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "flag_item_condition", deliveryItemId, condition: "DAMAGED" } } } } }) }); });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill("irsaliyeleri göster"); await page.getByRole("button", { name: "Gönder" }).click();
    const row = page.locator('[data-canonical-domain="delivery"] .workspace-record-row', { hasText: delivery!.deliveryNumber }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-delivery-action-surface="${delivery!.id}"]`); await expect(surface).toBeVisible({ timeout: 20_000 });
    await composer.fill("kalem durumunu hasarlı yap"); await page.getByRole("button", { name: "Gönder" }).click();
    await expect(surface.getByText("Hasarlı").first()).toBeVisible({ timeout: 20_000 });
    await surface.getByText("İrsaliye kalemleri", { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: "qa-screenshots/irsaliye-sesli-komut-kalem-hasarli.png", fullPage: false });
    const stored = await prisma.deliveryItem.findUnique({ where: { id: deliveryItemId } }); expect(stored?.conditionFlag).toBe("DAMAGED");
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
