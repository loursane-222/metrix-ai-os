import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { createSession } from "@/lib/auth/sessions/session.service";
import { prisma } from "@/lib/core/shared/prisma";

const suffix = randomUUID().slice(0, 8);
const customerName = "KANIT YILDIZ TEKNOLOJİ LİMİTED ŞİRKETİ";
const fixture = "qa-screenshots/belge-yukleme-test-vergi-levhasi.png";
const evidence = {
  upload: "qa-screenshots/belge-yukleme-01-yukleme.png",
  preview: "qa-screenshots/belge-yukleme-02-onizleme.png",
  result: "qa-screenshots/belge-yukleme-03-musteri-kaydi.png",
};

let organizationId = "";
let userId = "";
let sessionToken = "";

test.beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: `document-acceptance-${suffix}@metrix.invalid`,
      fullName: "METRIX Document Acceptance",
    },
  });
  userId = user.id;
  const organization = await prisma.organization.create({
    data: {
      name: `ACCEPTANCE Document Upload ${suffix}`,
      description: "Temporary isolated document-upload acceptance organization",
    },
  });
  organizationId = organization.id;
  await prisma.organizationMember.create({
    data: { organizationId, userId, role: "OWNER" },
  });
  sessionToken = (await createSession(userId, false)).token;
});

test.afterAll(async () => {
  if (organizationId) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

test("uploads a tax document from chat, reviews it, and commits a customer", async ({ context, page }) => {
  await context.addCookies([{
    name: "metrix_session",
    value: sessionToken,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  }]);

  await page.goto("/metrix");
  const skipFilm = page.getByRole("button", { name: "Şimdi Başla" });
  await expect(skipFilm).toBeVisible();
  await skipFilm.click();
  await expect(page.getByPlaceholder("Metrix ile konuş...")).toBeVisible();

  await page.getByRole("button", { name: "Dosya ekle" }).click();
  await expect(page.getByText("Dosya Yükle")).toBeVisible();
  await page.screenshot({ path: evidence.upload, fullPage: true });

  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles(fixture);
  await expect(page.getByText("belge-yukleme-test-vergi-levhasi.png")).toBeVisible();

  const extractionResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/customers/document-extractions")
    && response.request().method() === "POST",
  { timeout: 120_000 });
  await send(page, "Bu belgeden yeni müşteri kaydı oluştur");
  const extractionResponse = await extractionResponsePromise;
  console.info("DOCUMENT_EXTRACTION_RESPONSE", {
    status: extractionResponse.status(),
    body: (await extractionResponse.text()).slice(0, 1_000),
  });
  expect(extractionResponse.status()).toBe(200);
  await expect(page.getByText("Belge önizlemesi")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: evidence.preview, fullPage: true });

  const reviewResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/candidates-applied") && response.request().method() === "POST",
  );
  await startSend(page, "hepsini taslağa uygula");
  await page.waitForURL(/\/metrix\/customers\/new/u);
  await page.waitForFunction((expected) =>
    [...document.querySelectorAll("input")].some((input) => input.value === expected),
  customerName, { timeout: 30_000 });
  expect((await reviewResponsePromise).status()).toBe(200);
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/customers/actions/create")
    && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Olustur" }).click();
  const createResponse = await createResponsePromise;
  console.info("DOCUMENT_CREATE_RESPONSE", {
    status: createResponse.status(),
    body: (await createResponse.text()).slice(0, 1_000),
  });
  expect(createResponse.status()).toBe(200);
  await page.waitForURL(/\/metrix\/customers\/[^/]+$/u, { timeout: 60_000 });
  await expect(page.getByText(customerName, { exact: false })).toBeVisible();
  await page.screenshot({ path: evidence.result, fullPage: true });

  const customer = await prisma.customer.findFirst({
    where: { organizationId, displayName: customerName },
    select: { id: true, displayName: true, taxNumber: true },
  });
  expect(customer).toMatchObject({ displayName: customerName, taxNumber: "9876543210" });
  console.info("DOCUMENT_UPLOAD_ACCEPTANCE", {
    organizationId,
    customerId: customer?.id,
    customerName: customer?.displayName,
    screenshots: evidence,
  });
});

async function send(page: import("@playwright/test").Page, message: string) {
  await startSend(page, message);
  const input = page.getByPlaceholder("Metrix ile konuş...");
  await expect(input).toBeEnabled({ timeout: 120_000 });
}

async function startSend(page: import("@playwright/test").Page, message: string) {
  const input = page.getByPlaceholder("Metrix ile konuş...");
  await input.fill(message);
  await page.getByRole("button", { name: "Gönder" }).click();
}
