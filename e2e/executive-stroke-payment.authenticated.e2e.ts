import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("Executive Stroke confirms a real payment mutation and rejects an under-threshold gesture", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const organization = await prisma.organization.create({ data: { name: `Executive Stroke QA ${suffix}`, onboardingStatus: "COMPLETED" } });
  const user = await prisma.user.create({ data: { phone: `stroke-${suffix}@metrix.invalid`, fullName: "Executive Stroke QA", onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const payment = await prisma.payment.create({ data: { organizationId: organization.id, title: `Stroke payment ${suffix}`, amount: 100, paidAmount: 25, status: "PARTIAL", currency: "TRY" } });
  const session = await createSession(user.id, false);
  await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);

  try {
    const requested = await page.request.post(`/api/payments/${payment.id}/actions/apply`, { data: { operation: "request", amount: 75 } });
    expect(requested.status(), await requested.text()).toBe(200);
    const approvalId = (await requested.json()).data.approval.approvalId as string;
    const beforeApproval = await prisma.actionApproval.findUnique({ where: { id: approvalId } });
    const beforePayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(beforeApproval?.status).toBe("PENDING");
    expect(beforePayment?.status).toBe("PARTIAL");
    expect(String(beforePayment?.paidAmount)).toBe("25");

    await page.goto("/");
    const pendingRail = page.getByRole("complementary", { name: "Bekleyen iş: payment.apply için onay bekleniyor" });
    await expect(pendingRail).toBeVisible({ timeout: 45_000 });
    const stroke = pendingRail.getByRole("slider", { name: "Kararı kesinleştir" });
    const bounds = await stroke.boundingBox();
    expect(bounds).not.toBeNull();
    const y = bounds!.y + bounds!.height / 2;
    await page.mouse.move(bounds!.x + 2, y);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(bounds!.x + bounds!.width * 0.5, y);
    await page.mouse.up();
    await expect.poll(async () => (await prisma.actionApproval.findUnique({ where: { id: approvalId } }))?.status).toBe("PENDING");
    await expect.poll(async () => String((await prisma.payment.findUnique({ where: { id: payment.id } }))?.paidAmount)).toBe("25");

    await page.mouse.move(bounds!.x + 2, y);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(bounds!.x + bounds!.width * 0.95, y);
    await page.mouse.up();
    await expect.poll(async () => (await prisma.payment.findUnique({ where: { id: payment.id } }))?.status).toBe("PAID");
    await expect.poll(async () => String((await prisma.payment.findUnique({ where: { id: payment.id } }))?.paidAmount)).toBe("100");
    await expect.poll(async () => (await prisma.actionApproval.findUnique({ where: { id: approvalId } }))?.status).toBe("CONSUMED");

    const keyboardPayment = await prisma.payment.create({ data: { organizationId: organization.id, title: `Keyboard payment ${suffix}`, amount: 80, paidAmount: 0, status: "PENDING", currency: "TRY" } });
    const keyboardRequested = await page.request.post(`/api/payments/${keyboardPayment.id}/actions/apply`, { data: { operation: "request", amount: 80 } });
    expect(keyboardRequested.status(), await keyboardRequested.text()).toBe(200);
    const keyboardApprovalId = (await keyboardRequested.json()).data.approval.approvalId as string;
    await expect(page.getByRole("complementary", { name: "Bekleyen iş: payment.apply için onay bekleniyor" })).toBeVisible({ timeout: 20_000 });
    const keyboardStroke = page.getByRole("complementary", { name: "Bekleyen iş: payment.apply için onay bekleniyor" }).getByRole("slider", { name: "Kararı kesinleştir" });
    await keyboardStroke.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await prisma.payment.findUnique({ where: { id: keyboardPayment.id } }))?.status).toBe("PAID");
    await expect.poll(async () => (await prisma.actionApproval.findUnique({ where: { id: keyboardApprovalId } }))?.status).toBe("CONSUMED");
    await page.screenshot({ path: "qa-screenshots/executive-stroke-real-payment.png", fullPage: true });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
