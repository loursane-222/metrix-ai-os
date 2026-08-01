import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("auth form remains mouse and keyboard accessible in a short mobile viewport", async ({ context, page }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  const submit = page.getByRole("button", { name: "Kodu Gönder" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await page.getByLabel(/KVKK Aydınlatma Metni/).check();
  await submit.focus();
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Geçerli bir e-posta adresi girin.")).toBeVisible();
});

test("mobile workspace opens as one focused layer and returns to the live conversation", async ({ context, page }) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 8);
  const displayName = `METRIX Mobile Atlas ${suffix}`;
  const user = await prisma.user.create({ data: { phone: `mobile-${suffix}@metrix.invalid`, fullName: "METRIX Mobile Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `METRIX Mobile Acceptance ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/metrix");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await composer.fill(`Yeni müşteri kaydı aç. Firma ismi ${displayName}, İzmir-Bornova, yetkilisi Belgin Arda.`);
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByRole("region", { name: "Çalışma Alanı" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Firma adı *" })).toHaveValue(displayName, { timeout: 45_000 });
    await expect(page).toHaveURL(/\/metrix$/);
    const conversationId = await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"));
    await page.getByRole("button", { name: "Çalışma alanını kapat" }).click();
    await expect(page.getByRole("textbox", { name: /Metrix (?:ile konuş|yanıtlıyor)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Çalışma Alanını Aç" })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"))).toBe(conversationId);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
