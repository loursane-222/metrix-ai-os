import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

type StreamEvent = { type: string; content?: string; phase?: string; command?: { route?: string; expectedSurfaceAuthorityKey?: string }; ai?: { content?: string } };
async function send(page: import("@playwright/test").Page, message: string): Promise<StreamEvent[]> {
  return page.evaluate(async (bodyMessage) => {
    const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: bodyMessage }) });
    if (!response.ok || !response.body) throw new Error(`chat failed: ${response.status}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; const events: StreamEvent[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) if (line.trim()) events.push(JSON.parse(line)); }
    return events;
  }, message);
}

test("current quote pipeline returns deterministic currency-safe truth with canonical Quotes navigation", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `quote-pipeline-${suffix}@metrix.invalid`, fullName: "Quote Pipeline QA", onboardingStatus: "COMPLETED", timezone: "Europe/Istanbul" } });
  const organization = await prisma.organization.create({ data: { name: `QUOTE PIPELINE ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  await prisma.quote.createMany({ data: [
    { organizationId: organization.id, customerName: "Atlas", title: "Açık TRY", status: "SENT", amount: 10000, currency: "TRY", createdByUserId: user.id },
    { organizationId: organization.id, customerName: "Export", title: "Açık USD", status: "VIEWED", amount: 2000, currency: "USD", createdByUserId: user.id },
    { organizationId: organization.id, customerName: "Taslak", title: "Hariç", status: "DRAFT", amount: 99999, currency: "TRY", createdByUserId: user.id },
  ] });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/metrix");
    const events = await send(page, "Satış pipeline'ımız ne durumda?");
    const primary = events.filter((event) => event.type === "chunk" && event.phase === "primary").map((event) => event.content).join(" ");
    expect(primary).toContain("2 açık teklif"); expect(primary).toContain("10.000 TRY"); expect(primary).toContain("2.000 USD"); expect(primary).not.toContain("99.999");
    expect(events.find((event) => event.type === "navigation")?.command).toMatchObject({ route: "/metrix/offers", expectedSurfaceAuthorityKey: "offers.list.page" });
    expect(events.some((event) => event.phase === "enrichment")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
