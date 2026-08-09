import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("finansal faz1 kanit: gercek gider ve tahsilat verisi finansal sagliga yansir", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `finance-${suffix}@metrix.invalid`, fullName: "Finance Acceptance QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `FINANCE ACCEPTANCE ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  await prisma.expense.create({ data: { organizationId: organization.id, title: "Gecikmiş maaş", category: "PAYROLL", amount: 10_000, currency: "TRY", expenseDate: new Date(), recurrenceType: "MONTHLY", status: "OVERDUE" } });
  await prisma.payment.create({ data: { organizationId: organization.id, title: "Beklenen tahsilat", amount: 5_000, paidAmount: 0, currency: "TRY", dueDate: new Date(Date.now() + 7 * 86_400_000), status: "PENDING" } });
  await prisma.invoice.create({ data: { organizationId: organization.id, invoiceNumber: `FIN-${suffix}`, title: "Finans kabul faturası", amount: 4_000, taxRate: 20, taxAmount: 800, totalAmount: 4_800, currency: "TRY", status: "SENT" } });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/metrix");
    await page.getByRole("textbox", { name: "Metrix ile konuş..." }).fill("finansal durumu göster");
    await page.getByRole("button", { name: "Gönder" }).click();
    const surface = page.getByTestId("finance-summary");
    await expect(surface).toBeVisible({ timeout: 20_000 });
    await expect(surface.getByRole("heading", { name: "Finansal Sağlık" })).toBeVisible();
    await expect(surface.getByText("CRITICAL", { exact: true }).first()).toBeVisible();
    await expect(surface.getByText("Maaş ödemesi gecikmiş", { exact: false })).toBeVisible();
    await expect(surface.getByRole("heading", { name: "Gider Riski" })).toBeVisible();
    const expenseRisk = surface.getByRole("region", { name: "Gider Riski" });
    await expect(expenseRisk.getByText("₺10.000,00", { exact: true })).toBeVisible();
    await expect(expenseRisk.getByText("1", { exact: true })).toBeVisible();
    await page.screenshot({ path: "qa-screenshots/finansal-faz1-kanit.png", fullPage: false });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
