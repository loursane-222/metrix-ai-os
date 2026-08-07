import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/core/shared/prisma";
import { createSession } from "@/lib/auth/sessions/session.service";

test("speaks the canonical METRIX stream without an acknowledgement model", async ({ context, page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { phone: `voice-transport-${suffix}@metrix.invalid`, fullName: "Voice Transport QA", onboardingStatus: "COMPLETED" } });
  const organization = await prisma.organization.create({ data: { name: `Voice Transport QA ${suffix}`, onboardingStatus: "COMPLETED" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
  const session = await createSession(user.id, false);
  try {
    await context.addCookies([{ name: "metrix_session", value: session.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const began = performance.now();
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "voice", message: "Önümüzdeki hafta nakit akışında hangi riski önce ele almalıyım?" }) });
      if (!response.ok || !response.body) throw new Error(`voice chat failed: ${response.status}`);
      const authorityHeader = response.headers.get("X-Metrix-Response-Authority");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let primaryText = "";
      let enrichmentText = "";
      let firstPrimaryMs: number | null = null;
      let firstEnrichmentMs: number | null = null;
      let doneMs: number | null = null;
      let ttsPromise: Promise<{ firstByteMs: number; audioBytes: number; spokenText: string }> | null = null;
      const authorities: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; content?: string; phase?: string; responseAuthority?: string };
          if (event.responseAuthority) authorities.push(event.responseAuthority);
          if (event.type === "chunk" && event.phase === "primary") {
            firstPrimaryMs ??= Math.round(performance.now() - began);
            primaryText += event.content ?? "";
            const sentence = primaryText.match(/^(.+?[.!?])(?:\s|$)/u)?.[1]?.trim();
            if (sentence && !ttsPromise) {
              ttsPromise = (async () => {
                const ttsResponse = await fetch("/api/ai/chat/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: sentence, styleHint: "risk" }) });
                if (!ttsResponse.ok || !ttsResponse.body) throw new Error(`tts failed: ${ttsResponse.status}`);
                const ttsReader = ttsResponse.body.getReader();
                let audioBytes = 0;
                let firstByteMs = 0;
                while (true) {
                  const audio = await ttsReader.read();
                  if (audio.done) break;
                  if (!firstByteMs) firstByteMs = Math.round(performance.now() - began);
                  audioBytes += audio.value.byteLength;
                }
                return { firstByteMs, audioBytes, spokenText: sentence };
              })();
            }
          } else if (event.type === "chunk" && event.phase === "enrichment") {
            firstEnrichmentMs ??= Math.round(performance.now() - began);
            enrichmentText += event.content ?? "";
          } else if (event.type === "done") {
            doneMs = Math.round(performance.now() - began);
          }
        }
      }
      return { authorityHeader, authorities, firstPrimaryMs, firstEnrichmentMs, doneMs, primaryText: primaryText.trim(), enrichmentText: enrichmentText.trim(), tts: await ttsPromise };
    });
    expect(result.authorityHeader).toBe("canonical-http-pipeline");
    expect(result.authorities.length).toBeGreaterThan(0);
    expect(new Set(result.authorities)).toEqual(new Set(["metrix_main_model"]));
    expect(result.primaryText.length).toBeGreaterThan(0);
    expect(result.enrichmentText.length).toBeGreaterThan(0);
    expect(result.firstPrimaryMs).toBeLessThan(result.firstEnrichmentMs!);
    expect(result.firstEnrichmentMs).toBeLessThan(result.doneMs!);
    expect(result.tts?.audioBytes ?? 0).toBeGreaterThan(0);
    console.info("VOICE_TRANSPORT_ACCEPTANCE", JSON.stringify(result));
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
