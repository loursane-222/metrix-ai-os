import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("açık taslak fatura sohbet komutuyla gönderilir ve tekrar gönderim desteklenmez", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `invoice-command-${suffix}@metrix.invalid`, fullName: "Fatura Komut Kabul", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `INVOICE COMMAND ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Komut Müşterisi ${suffix}` } });
    const invoice = await prisma.invoice.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceNumber: `SES-${suffix}`, title: `Sesli komut faturası ${suffix}`, amount: 2_000, taxRate: 20, taxAmount: 400, totalAmount: 2_400, currency: "TRY", status: "DRAFT" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route(`**/api/invoices/${invoice.id}/actions/edit-command`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "send" } } } } }) }), { times: 1 });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await composer.fill(`${customer.displayName} için 500 TL fatura kes`); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    const row = page.locator('[data-canonical-domain="invoice"] .workspace-record-row', { hasText: invoice.invoiceNumber }); await expect(row).toBeVisible({ timeout: 30_000 }); await row.click();
    const surface = page.locator(`[data-invoice-action-surface="${invoice.id}"]`); await expect(surface).toBeVisible();
    await composer.fill("faturayı gönder"); await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect(surface.getByText("Gönderildi", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.status).toBe("SENT");
    const unsupported = await page.request.post(`/api/invoices/${invoice.id}/actions/edit-command`, { data: { utterance: "gönder", activeTab: "actions" } });
    expect(unsupported.ok()).toBe(true); expect(await unsupported.json()).toMatchObject({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "unsupported" } } } });
    await page.screenshot({ path: "qa-screenshots/fatura-sesli-komutla-gonderildi.png", fullPage: true });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
