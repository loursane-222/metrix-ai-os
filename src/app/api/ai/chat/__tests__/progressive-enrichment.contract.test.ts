import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");

describe("same-turn progressive enrichment", () => {
  it("uses one channel-neutral enrichment contract for text and voice", () => {
    expect(source).toContain("startProgressiveIntelligence();");
    expect(source).toContain('channel,\n                contextProfile: "business_light"');
    expect(source).not.toContain('channel === "voice" ? startProgressiveIntelligence');
    expect(source).toContain('phase: "enrichment"');
  });

  it("keeps first-token independent from heavy cognition", () => {
    const firstEnqueue = source.indexOf('controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk"');
    const intelligenceStart = source.indexOf("startProgressiveIntelligence();");
    const streamDone = source.indexOf("const finalMeta = await streamHandle.getFinalMeta()");
    expect(firstEnqueue).toBeLessThan(intelligenceStart);
    expect(intelligenceStart).toBeLessThan(streamDone);
  });

  it("streams enrichment before the terminal event and persists the combined answer", () => {
    const enrichmentChunk = source.indexOf('phase: "enrichment"');
    const append = source.indexOf("aiContent = `${aiContent}\\n\\n${enrichment.trim()}`");
    const done = source.indexOf('"done_event_sent"');
    const persistence = source.indexOf("await sendAiMessage({", done);
    expect(enrichmentChunk).toBeGreaterThan(0);
    expect(append).toBeGreaterThan(enrichmentChunk);
    expect(done).toBeGreaterThan(append);
    expect(persistence).toBeGreaterThan(done);
  });

  it("Root Cause 2: grounds the enrichment call in the same canonical evidence as the primary answer, not in pipeline C's own belief", () => {
    // The enrichment call must receive the real, primary-answer ground truth
    // (canonicalBusinessFacts / businessNavigationOperationEvidence / handoff
    // evidence) as its canonicalOperationEvidence — never enrichmentEvidence
    // (pipeline C's own, independently-derived reasoning). Passing
    // enrichmentEvidence there let a second model call assert facts/numbers
    // that contradict the already-streamed first answer in the same turn.
    const enrichmentCallStart = source.indexOf('requestId: `${requestId}:enrichment`');
    const enrichmentCallEnd = source.indexOf("});", enrichmentCallStart);
    const enrichmentCallBody = source.slice(enrichmentCallStart, enrichmentCallEnd);
    expect(enrichmentCallBody).toContain("canonicalOperationEvidence,");
    expect(enrichmentCallBody).not.toContain("canonicalOperationEvidence: enrichmentEvidence");
  });

  it("Root Cause 2: instructs the enrichment model to defer to canonical evidence and the first response on any conflict", () => {
    expect(source).toContain("Kanonik kanıt ve ilk yanıt her zaman üstündür");
  });
});
