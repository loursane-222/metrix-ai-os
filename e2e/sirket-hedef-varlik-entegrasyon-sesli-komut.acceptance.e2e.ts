import "dotenv/config"; import { randomUUID } from "node:crypto"; import { expect, test } from "@playwright/test"; import { prisma } from "@/lib/core/shared/prisma"; import { createSession } from "@/lib/auth/sessions/session.service";

test("şirket hedef/varlık/entegrasyon sesli komutları DB üzerinde kanıtlar", async ({ context, page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);

  const user = await prisma.user.create({ data: { phone: `cgoal-voice-${suffix}@metrix.invalid`, fullName: "Hedef Komut", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `CGOAL VOICE ${suffix}`, onboardingStatus: "COMPLETED" } });

  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await createSession(user.id, false);
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);

    // Route AI navigation
    await page.route("**/api/ai/chat", async (route) => {
      const correlationId = `cgoal-open-${suffix}`;
      const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page" } }), JSON.stringify({ type: "chunk", content: "Şirket ekranını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Şirket ekranını açıyorum." } })].join("\n") + "\n";
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }, { times: 1 });

    // Mock goal-create-command: set_field title → commit → POST
    await page.route("**/api/company/actions/goal-create-command", async (route) => {
      const utterance = (route.request().postDataJSON() as { utterance: string }).utterance;
      const command = (utterance.includes("kaydet") || utterance.includes("oluştur") || utterance.includes("commit"))
        ? { type: "commit" }
        : { type: "set_field", field: "title", value: `Hedef ${suffix}` };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) });
    });

    // Mock asset-create-command: set_field name → commit → POST
    await page.route("**/api/company/actions/asset-create-command", async (route) => {
      const utterance = (route.request().postDataJSON() as { utterance: string }).utterance;
      const command = (utterance.includes("kaydet") || utterance.includes("oluştur") || utterance.includes("commit"))
        ? { type: "commit" }
        : { type: "set_field", field: "name", value: `Varlık ${suffix}` };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) });
    });

    // Mock source-create-command: set_field provider → commit → POST
    await page.route("**/api/company/actions/source-create-command", async (route) => {
      const utterance = (route.request().postDataJSON() as { utterance: string }).utterance;
      const command = (utterance.includes("kaydet") || utterance.includes("oluştur") || utterance.includes("commit"))
        ? { type: "commit" }
        : { type: "set_field", field: "provider", value: `Kaynak${suffix}` };
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
    await expect(page.getByRole("button", { name: "Hedefler" })).toBeVisible({ timeout: 30_000 });

    const send = async (text: string, urlFragment: string) => {
      await expect(composer).toBeEnabled({ timeout: 60_000 });
      await composer.fill(text);
      const rp = page.waitForResponse((r) => r.url().includes(urlFragment));
      await page.getByRole("button", { name: "Gönder", exact: true }).click();
      await rp;
      await expect(composer).toBeEnabled({ timeout: 60_000 });
    };

    // --- Scenario 1: Create goal via voice ---
    await page.getByRole("button", { name: "Hedefler" }).click();
    await expect(page.getByLabel("Hedef adı")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    await send("hedef adını ayarla", "/api/company/actions/goal-create-command");
    await send("hedefi oluştur", "/api/company/actions/goal-create-command");
    await expect(page.getByRole("status")).toHaveText("Canonical hedef oluşturuldu.", { timeout: 30_000 });
    const createdGoal = await prisma.salesGoal.findFirst({ where: { organizationId: organization.id, title: `Hedef ${suffix}` } });
    expect(createdGoal).not.toBeNull();

    // --- Scenario 2: Create asset via voice ---
    await page.getByRole("button", { name: "Varlıklar" }).click();
    await expect(page.getByLabel("Varlık adı")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    await send("varlık adını ayarla", "/api/company/actions/asset-create-command");
    await send("varlığı oluştur", "/api/company/actions/asset-create-command");
    await expect(page.getByRole("status")).toHaveText("Canonical varlık kaydı oluşturuldu.", { timeout: 30_000 });
    const createdAsset = await prisma.companyAsset.findFirst({ where: { organizationId: organization.id, name: `Varlık ${suffix}` } });
    expect(createdAsset).not.toBeNull();

    // --- Scenario 3: Create data source via voice ---
    await page.getByRole("button", { name: "Entegrasyonlar" }).click();
    await expect(page.getByLabel("Provider")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    await send("provider adını ayarla", "/api/company/actions/source-create-command");
    await send("veri kaynağını oluştur", "/api/company/actions/source-create-command");
    await expect(page.getByRole("status")).toHaveText("Veri kaynağı canonical registry'ye kaydedildi.", { timeout: 30_000 });
    const createdSource = await prisma.companyDataSource.findFirst({ where: { organizationId: organization.id, provider: `Kaynak${suffix}` } });
    expect(createdSource).not.toBeNull();

    await page.screenshot({ path: "qa-screenshots/sirket-hedef-varlik-entegrasyon-sesli-komut.png", fullPage: true });
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
