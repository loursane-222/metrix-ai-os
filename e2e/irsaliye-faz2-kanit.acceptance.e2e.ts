import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";
import { refreshDeliveryIntelligence } from "@/lib/core/deliveries/delivery-intelligence.service";

const deliveryList = '[data-canonical-domain="delivery"][data-canonical-view="list"]';
const deliveryDetail = '[data-canonical-domain="delivery"][data-canonical-view="detail"]';

async function submitChat(page: import("@playwright/test").Page, message: string) {
  const composer = page.locator("[data-conversation-composer] textarea");
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await expect(composer).toBeEnabled({ timeout: 120_000 });
  await composer.fill(message);
  await page.getByRole("button", { name: "Gönder" }).click();
}

test("irsaliye faz2 kanit: butunluk + tasiyici + proof + istisna + temizlik", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const now = new Date();
  const user = await prisma.user.create({ data: { phone: `irsaliye-faz2-${suffix}@metrix.invalid`, fullName: "İrsaliye Faz 2 Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `IRSALIYE FAZ2 ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Teslim Müşteri ${suffix}`, source: "ACCEPTANCE" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: `Teslim Ürünü ${suffix}`, type: "PRODUCT", unit: "adet" } });

    async function seedDelivery(input: { sequence: number; carrier: string; quantity: number; ordered: number; conditionFlag: "OK" | "SHORT" | "DAMAGED"; commitmentAt: Date; dispatchedAt: Date; deliveredAt: Date; failed: boolean }) {
      const order = await prisma.order.create({ data: { organizationId: organization.id, customerId: customer.id, orderNumber: `SIP-F2-${input.sequence}-${suffix}`, status: "COMPLETED", commitmentAt: input.commitmentAt, items: { create: [{ organizationId: organization.id, productServiceId: product.id, name: product.name, unit: "adet", quantity: input.ordered, unitPriceCents: BigInt(10_000), lineTotalCents: BigInt(10_000 * input.ordered) }] } }, include: { items: true } });
      const delivery = await prisma.delivery.create({ data: { organizationId: organization.id, sourceOrderId: order.id, customerId: customer.id, deliveryNumber: `IRS-F2-${input.sequence}-${suffix}`, carrier: input.carrier, status: "COMPLETED", dispatchedAt: input.dispatchedAt, deliveredAt: input.deliveredAt, items: { create: [{ organizationId: organization.id, orderItemId: order.items[0]!.id, productServiceId: product.id, name: product.name, unit: "adet", quantity: input.quantity, conditionFlag: input.conditionFlag }] } }, include: { items: true } });
      const transitions = input.failed ? ["DRAFT", "DISPATCHED", "FAILED_DELIVERY", "RESCHEDULED", "DISPATCHED", "DELIVERED", "COMPLETED"] as const : ["DRAFT", "DISPATCHED", "DELIVERED", "COMPLETED"] as const;
      let previous: typeof transitions[number] | null = null;
      for (const status of transitions) {
        await prisma.deliveryStatusHistory.create({ data: { organizationId: organization.id, deliveryId: delivery.id, fromStatus: previous, toStatus: status } });
        previous = status;
      }
      await refreshDeliveryIntelligence(delivery.id, organization.id);
      return delivery;
    }

    const primary = await seedDelivery({ sequence: 1, carrier: "Hızlı Kargo", quantity: 5, ordered: 10, conditionFlag: "OK", commitmentAt: new Date(now.getTime() + 12 * 3_600_000), dispatchedAt: new Date(now.getTime() - 8 * 3_600_000), deliveredAt: now, failed: false });
    await seedDelivery({ sequence: 2, carrier: "Hızlı Kargo", quantity: 8, ordered: 8, conditionFlag: "SHORT", commitmentAt: new Date(now.getTime() + 2 * 3_600_000), dispatchedAt: new Date(now.getTime() - 20 * 3_600_000), deliveredAt: new Date(now.getTime() - 2 * 3_600_000), failed: false });
    await seedDelivery({ sequence: 3, carrier: "Güven Lojistik", quantity: 6, ordered: 6, conditionFlag: "DAMAGED", commitmentAt: new Date(now.getTime() - 24 * 3_600_000), dispatchedAt: new Date(now.getTime() - 48 * 3_600_000), deliveredAt: now, failed: true });

    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.waitForLoadState("networkidle");

    await submitChat(page, "irsaliyeleri göster");
    const targetRow = page.locator(`${deliveryList} .workspace-record-row`, { hasText: primary.deliveryNumber });
    await targetRow.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await targetRow.click();
    await page.locator(deliveryDetail).waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator(deliveryDetail)).toContainText("Sevkiyat bütünlüğü");
    await expect(page.locator(deliveryDetail)).toContainText("siparişin %50 oranındaki kısmını temsil ediyor");
    await expect(page.locator(deliveryDetail)).toContainText("bildirilen kalemin tamamı eksiksiz");
    await page.screenshot({ path: "qa-screenshots/irsaliye-faz2-butunluk.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_BUTUNLUK");

    await page.getByRole("button", { name: "Sohbete dön" }).click();
    await submitChat(page, "hangi taşıyıcı en iyi performans gösteriyor");
    await expect(page.getByText(/Kanonik kayıtlara göre:/).last()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Hızlı Kargo/).last()).toBeVisible();
    await expect(page.getByText(/Güven Lojistik/).last()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "qa-screenshots/irsaliye-faz2-tasiyici.png", fullPage: false });
    console.info("ACCEPTANCE_SCREENSHOT_TASIYICI");

    const proofResponse = await page.request.patch(`/api/deliveries/${primary.id}`, { data: { action: "proof", confirmationCode: "TESLIM-42", receiverName: "Ayşe Yılmaz", signatureCaptured: false, note: "Depo görevlisine teslim edildi" } });
    expect(proofResponse.status()).toBe(200);
    const exceptionResponse = await page.request.patch(`/api/deliveries/${primary.id}`, { data: { action: "exception", category: "CUSTOMER_NOT_AT_ADDRESS", note: "İlk ziyarette müşteri adreste yoktu" } });
    expect(exceptionResponse.status()).toBe(200);
    const stored = await prisma.delivery.findFirst({ where: { id: primary.id, organizationId: organization.id }, include: { exceptions: true } });
    expect(stored?.receiverName).toBe("Ayşe Yılmaz");
    expect(stored?.deliveryProof).toMatchObject({ confirmationCode: "TESLIM-42", signatureCaptured: false });
    expect(stored?.exceptions).toHaveLength(1);
    expect(stored?.exceptions[0]?.category).toBe("CUSTOMER_NOT_AT_ADDRESS");
    console.info("ACCEPTANCE_PROOF_EXCEPTION_VERIFIED");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    expect(await prisma.organization.count({ where: { name: { contains: `IRSALIYE FAZ2 ACCEPTANCE ${suffix}` } } })).toBe(0);
    console.info("ACCEPTANCE_CLEANUP_DONE");
  }
});
