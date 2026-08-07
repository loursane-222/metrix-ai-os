import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("streams deep executive reasoning into the same text turn", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `enrichment-${suffix}@metrix.invalid`, fullName: "Progressive Enrichment QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `Progressive Enrichment QA ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/");
    const startedAt = Date.now();
    const result = await page.evaluate(async () => {
      const began = performance.now();
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Önümüzdeki hafta nakit akışında hangi riski önce ele almalıyım? Gerekçesiyle değerlendir." }) });
      if (!response.ok || !response.body) throw new Error(`chat failed: ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const timedEvents: Array<{ atMs: number; event: { type: string; content?: string; phase?: string; ai?: { content?: string } } }> = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) timedEvents.push({ atMs: Math.round(performance.now() - began), event: JSON.parse(line) });
      }
      return timedEvents;
    });
    const events = result.map(({ event }) => event);
    const opening = events.filter((event) => event.type === "chunk" && event.phase === "opening").map((event) => event.content ?? "").join("").trim();
    const primary = events.filter((event) => event.type === "chunk" && event.phase === "primary").map((event) => event.content ?? "").join("").trim();
    const enrichment = events.filter((event) => event.type === "chunk" && event.phase === "enrichment").map((event) => event.content ?? "").join("").trim();
    const done = events.find((event) => event.type === "done");
    expect(opening.length).toBeGreaterThan(0);
    expect(primary.length).toBeGreaterThan(0);
    expect(enrichment.length).toBeGreaterThan(0);
    expect(events.findIndex((event) => event.phase === "enrichment")).toBeLessThan(events.findIndex((event) => event.type === "done"));
    expect(done?.ai?.content).toContain(enrichment);
    const firstOpeningMs = result.find(({ event }) => event.type === "chunk" && event.phase === "opening")?.atMs ?? null;
    const firstPrimaryMs = result.find(({ event }) => event.type === "chunk" && event.phase === "primary")?.atMs ?? null;
    const firstEnrichmentMs = result.find(({ event }) => event.phase === "enrichment")?.atMs ?? null;
    const doneMs = result.find(({ event }) => event.type === "done")?.atMs ?? null;
    console.info("PROGRESSIVE_ENRICHMENT_ACCEPTANCE", JSON.stringify({ elapsedMs: Date.now() - startedAt, firstOpeningMs, firstPrimaryMs, firstEnrichmentMs, doneMs, opening, primary, enrichment, final: done?.ai?.content }));
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
