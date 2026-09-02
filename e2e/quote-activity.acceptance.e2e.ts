import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

type StreamEvent = { type: string; content?: string; phase?: string; command?: unknown; ai?: { content?: string } };

async function send(page: import("@playwright/test").Page, message: string): Promise<StreamEvent[]> {
  return page.evaluate(async (bodyMessage) => {
    const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: bodyMessage }) });
    if (!response.ok || !response.body) throw new Error(`chat failed: ${response.status}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; const events: StreamEvent[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) events.push(JSON.parse(line));
    }
    return events;
  }, message);
}

test("canonical quote activity answers created and sent prompts without navigation", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `quote-activity-${suffix}@metrix.invalid`, fullName: "Quote Activity QA", onboardingStatus: "COMPLETED", timezone: "Europe/Istanbul" } });
  const organization = await prisma.organization.create({ data: { name: `QUOTE ACTIVITY ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const quote = await prisma.quote.create({ data: { organizationId: organization.id, customerName: "Atlas", title: "Atlas Teklifi", status: "SENT", sentAt: new Date(), createdByUserId: user.id } });
  await prisma.quoteEvent.createMany({ data: [
    { organizationId: organization.id, quoteId: quote.id, eventType: "QUOTE_SENT", source: "USER_CREATED" },
    { organizationId: organization.id, quoteId: quote.id, eventType: "QUOTE_SENT", source: "USER_CREATED", createdAt: new Date(Date.now() + 1_000) },
  ] });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/metrix");
    const created = await send(page, "Bu ay kaç teklif oluşturduk?");
    expect(created.filter((event) => event.type === "chunk" && event.phase === "primary").map((event) => event.content).join(" ")).toContain("1 teklif oluşturuldu");
    expect(created.some((event) => event.type === "navigation" || event.phase === "enrichment")).toBe(false);
    expect(created.at(-1)?.type).toBe("done");
    const sent = await send(page, "Bu ay teklifler kaç kez gönderildi?");
    expect(sent.filter((event) => event.type === "chunk" && event.phase === "primary").map((event) => event.content).join(" ")).toContain("toplam 2 kez gönderildi");
    expect(sent.some((event) => event.type === "navigation" || event.phase === "enrichment")).toBe(false);
    expect(sent.at(-1)?.type).toBe("done");
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
