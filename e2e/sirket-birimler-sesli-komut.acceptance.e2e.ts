import "dotenv/config"; import { randomUUID } from "node:crypto"; import { expect, test } from "@playwright/test"; import { prisma } from "@/lib/core/shared/prisma"; import { createSession } from "@/lib/auth/sessions/session.service";

test("şirket birimleri sesli komutları oluştur/primary/pasifleştir DB üzerinde kanıtlar", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const unitName = `Test Birimi ${suffix}`;
  const deactivateName = `Pasif Birimi ${suffix}`;

  const user = await prisma.user.create({ data: { phone: `unit-voice-${suffix}@metrix.invalid`, fullName: "Birim Komut", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `UNIT VOICE ${suffix}`, onboardingStatus: "COMPLETED" } });
  // seededUnit → primary senaryosu için (non-primary olarak başlar)
  const seededUnit = await prisma.companyUnit.create({ data: { organizationId: organization.id, name: unitName, unitType: "BRANCH", isPrimary: false, active: true } });
  // deactivateUnit → pasifleştir senaryosu için (primary değil, deactive edilebilir)
  const deactivateUnit = await prisma.companyUnit.create({ data: { organizationId: organization.id, name: deactivateName, unitType: "OFFICE", isPrimary: false, active: true } });

  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);

    // Route AI navigation
    await page.route("**/api/ai/chat", async (route) => {
      const correlationId = `unit-open-${suffix}`;
      const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page" } }), JSON.stringify({ type: "chunk", content: "Şirket ekranını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Şirket ekranını açıyorum." } })].join("\n") + "\n";
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });

    // Mock unit-action-command: primary → seededUnit, deactivate → deactivateUnit
    await page.route("**/api/company/actions/unit-action-command", async (route) => {
      const utterance = (route.request().postDataJSON() as { utterance: string }).utterance;
      const resolution = utterance.includes("primary")
        ? { kind: "executable", command: { type: "make_primary", unitId: seededUnit.id } }
        : utterance.includes("pasif") || utterance.includes("deactivate")
          ? { kind: "executable", command: { type: "deactivate", unitId: deactivateUnit.id } }
          : { kind: "unsupported" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution } } }) });
    });

    // Mock unit-form-command: create scenario (set_field name + commit → POST)
    await page.route("**/api/company/actions/unit-form-command", async (route) => {
      const utterance = (route.request().postDataJSON() as { utterance: string }).utterance;
      const command = (utterance.includes("kaydet") || utterance.includes("oluştur") || utterance.includes("commit"))
        ? { type: "commit" }
        : { type: "set_field", field: "name", value: `Yeni ${suffix}` };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) });
    });

    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." });
    await expect(composer).toBeEnabled({ timeout: 30_000 });

    // Navigate to company screen
    const navResponse = page.waitForResponse((r) => r.url().includes("/api/ai/chat"));
    await composer.fill("şirketi göster");
    await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await navResponse;
    await expect(page.getByRole("button", { name: "Adresler ve Birimler" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Adresler ve Birimler" }).click();
    // Wait for the seeded unit and form to be visible, then allow effects to settle
    await expect(page.getByText(unitName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Birim adı")).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const send = async (text: string, urlFragment: string) => {
      await expect(composer).toBeEnabled({ timeout: 60_000 });
      await composer.fill(text);
      const rp = page.waitForResponse((r) => r.url().includes(urlFragment));
      await page.getByRole("button", { name: "Gönder", exact: true }).click();
      await rp;
      await expect(composer).toBeEnabled({ timeout: 60_000 });
    };

    // Scenario 1: Create a new unit via voice form (set_field name + commit → POST)
    await send("yeni birim adını ayarla", "/api/company/actions/unit-form-command");
    await send("yeni birimi oluştur", "/api/company/actions/unit-form-command");
    await expect(page.getByRole("status")).toHaveText("Operasyon birimi eklendi.", { timeout: 30_000 });
    const created = await prisma.companyUnit.findFirst({ where: { organizationId: organization.id, name: `Yeni ${suffix}` } });
    expect(created).not.toBeNull();

    // Scenario 2: Make seededUnit primary via voice
    await send("birimi primary yap", "/api/company/actions/unit-action-command");
    await expect(page.getByRole("status")).toHaveText("Birim primary olarak ayarlandı.", { timeout: 30_000 });
    const afterPrimary = await prisma.companyUnit.findUnique({ where: { id: seededUnit.id } });
    expect(afterPrimary?.isPrimary).toBe(true);

    // Scenario 3: Deactivate deactivateUnit (non-primary) via voice
    await send("birimi pasifleştir", "/api/company/actions/unit-action-command");
    await expect(page.getByRole("status")).toHaveText("Birim ve bağlı geçmiş korunarak pasifleştirildi.", { timeout: 30_000 });
    const afterDeactivate = await prisma.companyUnit.findUnique({ where: { id: deactivateUnit.id } });
    expect(afterDeactivate?.active).toBe(false);

    await page.screenshot({ path: "qa-screenshots/sirket-birimler-sesli-komut.png", fullPage: true });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
