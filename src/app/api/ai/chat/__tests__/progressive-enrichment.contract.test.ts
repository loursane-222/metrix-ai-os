import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");

/**
 * Unified Executive Turn Runtime consolidation. Same-turn "progressive
 * enrichment" used to mean: stream the primary answer, then — after it had
 * already fully completed — run a SECOND, independent model call
 * ("pipeline C") and append its output onto the same message, mitigated
 * only by a paragraph-contradiction filter (stripContradictingSentences).
 * That second call was a real competing narration producer: exactly the
 * two-owners-per-turn pattern this operation exists to retire.
 *
 * Turn-specific Executive cognition (resolveChatExecutiveCognition /
 * buildExecutiveIntelligence — genuinely derived from this turn's message,
 * unlike the org-wide standing executiveBrain brief) is now started as
 * early as its inputs allow and awaited once, BEFORE the canonical prompt
 * is assembled, feeding the existing (previously null-starved)
 * executiveOperatingSystem prompt slot. There is exactly one generation,
 * and it already has real Executive judgment available to it from the
 * start — nothing is appended after the fact.
 */
describe("same-turn executive cognition feeds the one primary generation, not a second call", () => {
  it("has retired every function/call-site of the second, independent enrichment model call (comment mentions of the retired names are fine)", () => {
    expect(source).not.toContain("shouldAppendProgressiveEnrichment(");
    expect(source).not.toContain("function buildProgressiveEnrichmentEvidence(");
    expect(source).not.toContain("function buildProgressiveEnrichmentInstruction(");
    expect(source).not.toContain("stripContradictingSentences(");
    expect(source).not.toContain('requestId: `${requestId}:enrichment`');
    expect(source).not.toContain('phase: "enrichment"');
    expect(source).not.toContain("type ProgressiveEnrichmentInput");
  });

  // Grand Consolidation Operation: resolveChatExecutiveCognition /
  // buildExecutiveIntelligence / buildExecutiveContextV2 /
  // buildExecutiveOperatingSystem (the old 3-call EOS pipeline) are retired
  // as an independent cognition owner. The METRIX Executive Agent (Agents
  // SDK, src/lib/executive-agent) replaces it: it selects its own evidence
  // via real tool calls AND produces the final response itself, in one
  // loop, gated by executiveAgentWillRespond.
  it("has retired the old EOS pipeline entirely — no chatExecutiveCognitionPromise, resolveChatExecutiveCognition, or buildExecutiveOperatingSystem call site remains", () => {
    expect(source).not.toContain("chatExecutiveCognitionPromise");
    expect(source).not.toContain("resolveChatExecutiveCognition(");
    expect(source).not.toContain("buildExecutiveOperatingSystem(");
    expect(source).not.toContain("buildExecutiveContextV2(");
  });

  it("feeds a retired, always-null executiveOperatingSystem into the primary generation's evidence slot", () => {
    expect(source).toContain("const executiveOperatingSystem = null;");
    // Still the same single param slot on the one primary streamWithAiGateway
    // call as before — this is a data fix, not a new architecture.
    expect(source).toContain("executiveOperatingSystem,\n      requiresExecutiveReasoning,");
  });

  it("resolves cognitionObservation once, upfront, as a const — no post-stream reassignment site remains, and no LLM call produces it anymore", () => {
    expect(source).toContain(
      "const cognitionObservation: ChatExecutiveCognitionObservation = {",
    );
    expect(source).not.toContain("buildChatExecutiveCognitionObservation(");
    expect(source).not.toContain("cognitionObservation = progressiveIntelligence");
    expect(source).not.toContain("cognitionObservation = postStreamIntelligence");
  });

  it("runs the METRIX Executive Agent as the one owner of turn-specific cognition, exactly once per turn", () => {
    expect(source).toContain("import { runExecutiveAgent,");
    expect((source.match(/await runExecutiveAgent\(/g) ?? []).length).toBe(1);
    expect(source).toContain("const executiveAgentWillRespond =");
  });

  it("keeps the org-wide standing executiveBrain brief (buildExecutiveBrainShadowMetadata) out of the primary generation and out of turn-specific cognition's own type — still deferred/shadow, on purpose", () => {
    // Regression guard for the "tahsilat ve nakit riski..." leak: the
    // standing brief must never be fed into a live generation unconditionally.
    const shadowIdx = source.indexOf("type ProgressiveIntelligence = {");
    const shadowBlock = source.slice(shadowIdx, shadowIdx + 300);
    expect(shadowBlock).toContain("executiveBrain: ExecutiveBrainShadowMetadata");
    expect(shadowBlock).not.toContain("cognitionObservation");
  });

  it("only one place ever calls streamWithAiGateway for this turn's narration", () => {
    const occurrences = (source.match(/streamWithAiGateway\(\{/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
