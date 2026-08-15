import "dotenv/config"; import { randomUUID } from "node:crypto"; import { expect, test } from "@playwright/test"; import { prisma } from "@/lib/core/shared/prisma"; import { createSession } from "@/lib/auth/sessions/session.service";
test("şirket profil sesli komutları direkt PATCH ve BusinessCandidate'i DB üzerinde kanıtlar", async ({ context, page }) => {
  test.setTimeout(180_000); const suffix = randomUUID().slice(0, 8); const brandName = `Test Marka ${suffix}`; const taxNumber = "9876543210";
  const user = await prisma.user.create({ data: { phone: `company-voice-${suffix}@metrix.invalid`, fullName: "Şirket Komut", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `COMPANY VOICE ${suffix}`, onboardingStatus: "COMPLETED" } });
  try {
    await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await createSession(user.id, false); await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    // Navigation: open company screen in workspace
    await page.route("**/api/ai/chat", async (route) => { const correlationId = `company-open-${suffix}`; const body = [JSON.stringify({ type: "navigation", command: { correlationId, source: "written", route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page" } }), JSON.stringify({ type: "chunk", content: "Şirket ekranını açıyorum." }), JSON.stringify({ type: "done", conversationId: correlationId, ai: { content: "Şirket ekranını açıyorum." } })].join("\n") + "\n"; await route.fulfill({ status: 200, contentType: "application/x-ndjson", body }); }, { times: 1 });
    await page.route("**/api/company/actions/profile-edit-command", async (route) => { const utterance = (route.request().postDataJSON() as { utterance: string }).utterance; const command = utterance.includes("kaydet") ? { type: "commit" } : { type: "set_field", field: "brandName", value: brandName }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) }); });
    await page.route("**/api/company/actions/profile-candidate-command", async (route) => { const utterance = (route.request().postDataJSON() as { utterance: string }).utterance; const command = utterance.includes("gönder") ? { type: "commit" } : { type: "set_field", field: "taxNumber", value: taxNumber }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: { kind: "resolved", resolution: { kind: "executable", command } } } }) }); });
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/");
    const composer = page.getByRole("textbox", { name: "Metrix ile konuş..." }); await expect(composer).toBeEnabled({ timeout: 30_000 });
    // Open company screen via workspace navigation
    const navResponse = page.waitForResponse((r) => r.url().includes("/api/ai/chat")); await composer.fill("şirketi göster"); await page.getByRole("button", { name: "Gönder" }).click(); await navResponse;
    // Wait for CompanyOperatingScreen to mount in workspace
    await expect(page.getByRole("button", { name: "Kimlik ve İletişim" })).toBeVisible({ timeout: 30_000 });
    // Scenario 1: Kimlik ve İletişim → brandName → direct PATCH
    await page.getByRole("button", { name: "Kimlik ve İletişim" }).click(); await expect(page.getByLabel("Marka adı")).toBeVisible({ timeout: 10_000 });
    const send = async (text: string, urlFragment: string) => { await expect(composer).toBeEnabled({ timeout: 60_000 }); await composer.fill(text); const rp = page.waitForResponse((r) => r.url().includes(urlFragment)); await page.getByRole("button", { name: "Gönder" }).click(); await rp; await expect(composer).toBeEnabled({ timeout: 60_000 }); };
    await send("marka adını güncelle", "/api/company/actions/profile-edit-command"); await expect(page.getByLabel("Marka adı")).toHaveValue(brandName);
    await send("değişiklikleri kaydet", "/api/company/actions/profile-edit-command"); await expect(page.getByRole("status")).toHaveText("Canonical şirket profili güncellendi.", { timeout: 30_000 });
    expect((await prisma.companyProfile.findUnique({ where: { organizationId: organization.id } }))?.brandName).toBe(brandName);
    // Scenario 2: Resmî Bilgiler → taxNumber → BusinessCandidate, NOT direct write
    await page.getByRole("button", { name: "Resmî Bilgiler" }).click(); await expect(page.getByLabel("Vergi numarası")).toBeVisible({ timeout: 10_000 });
    await send("vergi numarasını ayarla", "/api/company/actions/profile-candidate-command"); await expect(page.getByLabel("Vergi numarası")).toHaveValue(taxNumber);
    await send("onaya gönder", "/api/company/actions/profile-candidate-command"); await expect(page.getByRole("status")).toHaveText("Değişiklik doğrudan yazılmadı; açık onay için Business Candidate oluşturuldu.", { timeout: 30_000 });
    expect((await prisma.companyProfile.findUnique({ where: { organizationId: organization.id } }))?.taxNumber).toBeNull();
    const candidate = await prisma.businessCandidate.findFirstOrThrow({ where: { organizationId: organization.id, targetDomain: "CompanyProfile" }, include: { changes: true } });
    expect(candidate.changes.some((c) => c.fieldPath === "taxNumber" && c.proposedValue === taxNumber)).toBe(true);
    await page.screenshot({ path: "qa-screenshots/sirket-profil-sesli-komut.png", fullPage: true });
  } finally { await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); }
});
