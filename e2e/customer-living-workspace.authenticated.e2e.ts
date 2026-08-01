import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("authenticated customer lookup, Living Workspace draft and canonical commit", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const existingName = "Atlas";
  const createdName = `METRIX Acceptance Atlas ${suffix}`;
  const user = await prisma.user.create({ data: { phone: `browser-${suffix}@metrix.invalid`, fullName: "METRIX Browser Acceptance", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `METRIX Browser Acceptance ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const existing = await prisma.customer.create({ data: { organizationId: organization.id, displayName: existingName, source: "ACCEPTANCE" } });
  const session = await createSession(user.id, false);

  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const lifecycle: Array<Record<string, unknown>> = [];
    page.on("console", (message) => {
      if (message.text().includes("field batch failed")) console.info("ACCEPTANCE_FIELD_BATCH_ERROR", message.text());
      const match = message.text().match(/^\[BusinessNavigationClient\]\[lifecycle\] (\{.*\})$/u);
      if (match?.[1]) {
        const event = JSON.parse(match[1]) as Record<string, unknown>;
        lifecycle.push(event);
        console.info("ACCEPTANCE_NAVIGATION_LIFECYCLE", event);
      }
    });
    await page.goto("/metrix");
    const canonicalDetail = await page.request.get(`/api/customers/${existing.id}`);
    expect(canonicalDetail.status(), await canonicalDetail.text()).toBe(200);
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });

    await composer.fill(`${existingName} müşterisini aç.`);
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page).toHaveURL(/\/metrix$/);
    await expect(page.getByRole("textbox", { name: "Firma Adi *" })).toHaveValue(existingName, { timeout: 45_000 });
    const conversationId = await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"));
    expect(conversationId).toBeTruthy();
    await expect.poll(() => lifecycle.map(({ event }) => event), { timeout: 20_000 }).toEqual(expect.arrayContaining(["stream_event_received", "dispatch_started", "host_command_received", "navigation_route_acknowledged", "navigation_surface_ready", "surface_claimed", "navigation_completed"]));

    await composer.fill(`Bulunmayan ${suffix} müşterisini aç.`);
    await page.getByRole("button", { name: "Gönder" }).click();
    const notFoundAnswer = page.locator("p").filter({ hasText: suffix }).last();
    await expect(notFoundAnswer).toBeVisible({ timeout: 45_000 });
    await expect(notFoundAnswer).not.toContainText(/yetkim yok|erişimim yok|bağlantım yok|yapamam/iu);
    expect(await page.evaluate(() => sessionStorage.getItem("metrix-chat-conversation-id"))).toBe(conversationId);

    await composer.fill(`Yeni müşteri kaydı aç. Firma ismi ${createdName}, İzmir-Bornova, yetkilisi Belgin Arda.`);
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page).toHaveURL(/\/metrix$/);
    await expect(page.getByRole("textbox", { name: "Firma adı *" })).toHaveValue(createdName, { timeout: 45_000 });
    await expect(page.getByRole("textbox", { name: "Fatura city" })).toHaveValue("İzmir");
    await expect(page.getByRole("textbox", { name: "Fatura district" })).toHaveValue("Bornova");
    await expect(page.getByRole("textbox", { name: "Yetkili kişi" })).toHaveValue("Belgin Arda");
    await page.getByRole("textbox", { name: "Fatura district" }).fill("Konak");
    await page.getByRole("button", { name: "Olustur" }).click();
    const created = await expect.poll(() => prisma.customer.findFirst({ where: { organizationId: organization.id, displayName: createdName }, include: { contacts: true } }), { timeout: 30_000 }).not.toBeNull();
    void created;
    const canonical = await prisma.customer.findFirstOrThrow({ where: { organizationId: organization.id, displayName: createdName }, include: { contacts: true } });
    expect(canonical.billingAddress).toMatchObject({ city: "İzmir", district: "Konak" });
    expect(canonical.contacts.some((contact) => contact.fullName === "Belgin Arda")).toBe(true);
    expect(existing.id).toBeTruthy();
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
