import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

const MESSAGES = [
  "Önümüzdeki hafta nakit akışında hangi riski önce ele almalıyım?",
  "Atlas müşterisinin ödeme durumunu nasıl değerlendirelim?",
  "Satış hedefimizin gerisinde kalma ihtimaline bakar mısın?",
  "Ekibin bu haftaki önceliğini netleştirelim.",
  "Açık tekliflerde hangi noktaya odaklanmalıyız?",
] as const;

test("produces message-specific METRIX openings", async ({ context, page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `opening-${suffix}@metrix.invalid`, fullName: "Opening QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `Opening QA ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/");
    const results = await page.evaluate(async (messages) => Promise.all(messages.map(async (message) => {
      const began = performance.now();
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok || !response.body) throw new Error(`chat failed: ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let opening = "";
      let firstOpeningMs: number | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; phase?: string; content?: string };
          if (event.type === "chunk" && event.phase === "opening") {
            firstOpeningMs ??= Math.round(performance.now() - began);
            opening += event.content ?? "";
          }
        }
      }
      return { message, firstOpeningMs, opening: opening.trim() };
    })), MESSAGES);

    for (const result of results) {
      expect(result.firstOpeningMs).not.toBeNull();
      expect(result.opening).toMatch(/[.!?]$/u);
      expect(result.opening).not.toMatch(/tabii|elbette|hemen bakıyorum|yardımcı olayım/iu);
    }
    expect(new Set(results.map((result) => result.opening)).size).toBe(MESSAGES.length);
    console.info("METRIX_OPENING_TRANSCRIPTS", JSON.stringify(results));
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
