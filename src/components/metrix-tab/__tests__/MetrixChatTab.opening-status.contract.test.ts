import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../MetrixChatTab.tsx", import.meta.url), "utf8");

// Regression suite for the "External World + Conversation Presentation"
// polish, Problem 3: the server's "opening" stream phase (a disposable,
// LLM-generated investigation-move sentence from createMetrixOpeningStream
// in route.ts, e.g. "Güncel kuru kontrol ediyorum.") was being rendered as
// an ordinary METRIX message — startNewAssistantMessage() fired on the
// first chunk of ANY phase, with no gate on chunkPhase. Root cause was
// structural (phase ownership in the chunk handler), not missing phrase
// detection, so the fix routes ALL opening-phase content through the one
// existing RuntimeStatus (yellow/gold) presentation instead of adding a
// second status component or a Turkish-phrase classifier.
describe("MetrixChatTab opening-phase status contract", () => {
  it("14. reuses the existing RuntimeStatus (yellow/gold) presentation — no second status component is created", () => {
    // Only one RuntimeStatus function definition exists in the file.
    expect(source.match(/function RuntimeStatus\(/g)?.length).toBe(1);
    expect(source).toContain('transientStatus ? <RuntimeStatus status={transientStatus} /> : <ThinkingBubble />');
  });

  it("15/16/17. routes opening-phase content (request evaluation / data-check / research investigation moves) to setTransientStatus, not to a new assistant message", () => {
    // The opening branch is structural — gated on chunkPhase === "opening",
    // never on the sentence's wording — so whatever topic-specific move the
    // model names (scope evaluation, record check, research) all take the
    // same one path.
    expect(source).toContain('if (isOpeningPhase) {');
    expect(source).toContain('openingStatusContentRef.current += content;');
    expect(source).toContain('setTransientStatus({ turnId: turn.turnId, category: "opening", content: openingStatusContentRef.current });');
  });

  it("18. artifact-generation interim status: no dedicated stream event exists yet for it — not fabricated as covered", () => {
    // route.ts resolves artifactRequest via a promise (artifactOutcomePromise)
    // with no distinct interim chunk phase of its own; if the model happens
    // to narrate it in the opening sentence, it already goes through the
    // same opening-phase branch above, but there is no separate
    // "artifact-generation" event to assert on independently.
    expect(source).not.toMatch(/phase\s*===\s*["']artifact["']/);
  });

  it("19. an ordinary final METRIX answer (primary phase) still starts a new assistant message and renders as normal conversation", () => {
    expect(source).toContain('} else if (content && activeTextGenerationRef.current === null) {');
    expect(source).toContain("activeTextGenerationRef.current = startNewAssistantMessage();");
  });

  it("20. the user message path is unchanged", () => {
    expect(source).toContain('setMessages((prev) => [...prev, { role: "user", content: text }]);');
  });

  it("21. the opening branch never calls startNewAssistantMessage or setMessages — an interim/status chunk cannot become a persisted final assistant message merely because its text is natural language", () => {
    const openingBranchMatch = source.match(/if \(isOpeningPhase\) \{[\s\S]*?\n(?:\s{12}\})\s*else if \(content/);
    expect(openingBranchMatch).not.toBeNull();
    const openingBranch = openingBranchMatch![0];
    expect(openingBranch).not.toContain("startNewAssistantMessage");
    expect(openingBranch).not.toContain("setMessages(");
  });

  it("22. final-answer overwrite protection remains intact — transitioning out of the opening phase still resets the buffered opening text before primary content starts", () => {
    expect(source).toContain('if (activeChunkPhaseRef.current === "opening" && chunkPhase !== "opening") {');
    expect(source).toContain("streamingContentRef.current = \"\";\n              pendingBufferRef.current = \"\";");
  });

  it("23. no phrase-based status classifier is introduced — the opening branch is gated purely on the structural chunkPhase field, not on Turkish text matching", () => {
    expect(source).not.toMatch(/content\.includes\(["'](kontrol ediyorum|araştırıyorum|inceliyorum|hazırlıyorum)["']\)/);
    expect(source).toContain("const isOpeningPhase = chunkPhase === \"opening\";");
  });

  it("24. voice/text response ownership is unchanged — voice still only reads non-opening (primary) content aloud", () => {
    expect(source).toContain("if (isVoice && !isOpeningPhase) {\n              orchestrator.onChunk(content);\n            }");
  });

  it("resets accumulated opening status text on every new turn", () => {
    expect(source).toContain("openingStatusContentRef.current = \"\";");
  });
});
