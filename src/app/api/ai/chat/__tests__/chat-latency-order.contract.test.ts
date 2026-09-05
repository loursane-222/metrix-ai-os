import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");

describe("text chat first-byte order", () => {
  it("defers capture and memory side effects until after first enqueue", () => {
    const enqueue = source.indexOf('controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk"');
    const deferredStart = source.indexOf("startDeferredInputEffects();", enqueue);
    expect(enqueue).toBeGreaterThan(0);
    expect(deferredStart).toBeGreaterThan(enqueue);
    expect(source.slice(source.indexOf("const userMessage = await"), source.indexOf("const organizationSummary")))
      .not.toContain("await captureLiveCustomerConversation");
  });

  it("contains deferred failures without failing the visible stream", () => {
    expect(source).toContain('[DEGRADED:universal_capture] live conversation capture failed:');
    expect(source).toContain('[DEGRADED:knowledge_acquisition] detection/memory candidate flow failed:');
    expect(source).toContain('[DEGRADED:memory_candidates] deferred candidate flow failed:');
    expect(source).toContain("if (!visibleDoneSent)");
    expect(source).toContain("[ConversationFirst] post-response work failed:");
  });

  it("keeps one canonical understanding path for text and voice", () => {
    expect(source).toContain('"classification_fast_path"');
    expect(source).toContain('"classification_done"');
    expect(source).toContain("fastPath: fastPathResult.matched");
    expect(source).toContain("? Promise.resolve(fastPathResult.understanding)");
    expect(source).toContain("classifyConversation({ message, recentMessages })");
    expect(source).not.toContain('const classifyPromise = channel === "voice"');
  });

  it("starts provider understanding before independent conversation and memory reads", () => {
    const classifyStart = source.indexOf("const classificationRecentMessagesPromise =");
    const independentReads = source.indexOf("const [conversation, activeMemoryItems] = await Promise.all([");
    const classifyAwait = source.indexOf("const conversationUnderstanding = await classifyPromise");
    expect(classifyStart).toBeGreaterThan(0);
    expect(classifyStart).toBeLessThan(independentReads);
    expect(classifyAwait).toBeGreaterThan(independentReads);
    expect(source.match(/classifyConversation\(\{ message, recentMessages \}\)/g)).toHaveLength(1);
    // A rejected recent-messages read must never escape past classifyPromise —
    // that would bypass classifyConversation's own SAFE_FALLBACK catch and
    // surface as a bare route-level error instead of a graceful degradation.
    expect(source).toContain(".catch(() => undefined)");
    // classificationRecentMessagesPromise must be chained onto (.then), not
    // awaited, before classifyPromise is constructed — an inline await here
    // would serialize the DB read ahead of the provider call, undermining
    // the overlap this test protects.
    expect(source.slice(classifyStart, independentReads)).not.toContain("await classificationRecentMessagesPromise");
  });

  it("resolves readiness before classification and overlaps intelligence with the primary stream", () => {
    expect(source.indexOf('"response_readiness_resolved"')).toBeLessThan(source.indexOf('"classification_start"'));
    expect(source).toContain("startProgressiveIntelligence();");
    expect(source.indexOf("startProgressiveIntelligence();")).toBeGreaterThan(
      source.indexOf('controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk"'),
    );
    expect(source).not.toContain('phase: "enrichment"');
    expect(source).toContain('"status_to_first_real_chunk_ms"');
  });

  it("overlaps user-message persistence with gateway preparation", () => {
    expect(source).toContain("const userMessagePromise = sendUserMessage({");
    expect(source.indexOf("const userMessagePromise = sendUserMessage({")).toBeLessThan(
      source.indexOf("return streamWithAiGateway({"),
    );
    const streamingPreGateway = source.slice(
      source.indexOf("// Learning-loop persistence remains a genuinely deferred"),
      source.indexOf("return streamWithAiGateway({"),
    );
    expect(streamingPreGateway).not.toContain("await userMessagePromise");
  });

  it("builds one request-scoped memory context and reuses it", () => {
    expect(source.match(/const requestMemoryContext = buildMemoryContextFromItems/g))
      .toHaveLength(1);
    // Grand Consolidation Operation: resolveChatExecutiveCognition (EOS) is
    // retired, so requestMemoryContext now feeds only the primary gateway
    // call directly — the Executive Agent gets institutional memory through
    // its own memory_search_relevant tool (src/lib/executive-agent/tools/
    // memory-tools.ts), retrieved on demand, not pre-loaded into every turn.
    expect(source.match(/preloadedMemoryContext: requestMemoryContext/g))
      .toHaveLength(1);
  });

  it("keeps transient status metadata content-free", () => {
    const statusTelemetry = source.slice(source.indexOf('"status_event_sent"'), source.indexOf('"classification_start"'));
    expect(statusTelemetry).toContain("statusCategory");
    expect(statusTelemetry).not.toContain("statusContent");
    expect(statusTelemetry).not.toContain("message,");
  });

  it("correlates gateway telemetry and exposes a no-buffer stream response", () => {
    expect(source).toContain("requestId,");
    expect(source).toContain('"Content-Type": "application/x-ndjson; charset=utf-8"');
    expect(source).toContain('"Cache-Control": "no-cache, no-store, must-revalidate"');
    expect(source).toContain('"X-Accel-Buffering": "no"');
    expect(source).toContain('"X-Request-Id": requestId');
    expect(source).not.toContain('"Content-Length"');
  });

  it("keeps Executive Intelligence free of classification ownership", () => {
    const removedDiagnosticEvent = ["duplicate", "classification", "scheduled"].join("_");
    const serviceSource = readFileSync(
      resolve(process.cwd(), "src/lib/executive-intelligence/executive-intelligence.service.ts"),
      "utf8",
    );
    const adapterSource = readFileSync(
      resolve(process.cwd(), "src/lib/ai/chat-executive-intelligence.adapter.ts"),
      "utf8",
    );

    expect(serviceSource).not.toContain("classifyConversation");
    expect(adapterSource).not.toContain("classifyConversation");
    expect(adapterSource).not.toContain(removedDiagnosticEvent);
  });

  it("starts shared cognition after the primary stream is ready and enriches before done", () => {
    expect(source).not.toContain('const voiceCognition = channel === "voice"');
    expect(source).toContain("const startProgressiveIntelligence = () =>");
    expect(source.indexOf("startProgressiveIntelligence();")).toBeGreaterThan(
      source.indexOf('controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk"'),
    );
    // Retired: EOS is never built anymore (see progressive-enrichment
    // contract's own retirement tests) — executiveOperatingSystem is always
    // null, and the gateway's own generation is skipped whenever the
    // Executive Agent is the one answering (executiveAgentWillRespond).
    expect(source).toContain("const executiveOperatingSystem = null;");
    expect(source).toContain("contextProfile: runtimeResolution.contextProfile");
    expect(source).toContain("executiveOperatingSystem,\n      requiresExecutiveReasoning,");
    expect(source).toContain(
      "preloadedMemoryContext: requestMemoryContext",
    );
  });

  // Grand Consolidation Operation: the old EOS pipeline (executive_reasoning
  // + recommended_next_move + eos_learning_loop, 3 sequential gpt-4.1 calls)
  // is retired. The METRIX Executive Agent replaces it as the one turn-
  // specific cognition owner, and it both selects its own evidence (via
  // real tool calls) AND produces the final response in one loop — there is
  // no separate "prepare evidence, then generate" split left to order
  // against the management-picture read. It runs inside the primary stream,
  // after the fast-path/handoff/navigation checks have already decided
  // whether it's even needed (executiveAgentWillRespond), and its own text
  // deltas ARE the primary stream's chunks — not a second call layered onto
  // an already-decided evidence set.
  it("runs the Executive Agent exactly once per turn, gated by executiveAgentWillRespond, streaming its own text as the primary chunks", () => {
    expect(source.match(/await runExecutiveAgent\(/g)).toHaveLength(1);
    expect(source).toContain("const executiveAgentWillRespond =");
    const agentCallIdx = source.indexOf("await runExecutiveAgent(");
    const primaryGatewayCall = source.indexOf("return streamWithAiGateway({");
    expect(agentCallIdx).toBeGreaterThan(-1);
    // The gateway call is prepared (with skipProviderGeneration when the
    // Agent will answer) before the stream body starts; the Agent itself
    // runs inside the stream body, after that preparation.
    expect(agentCallIdx).toBeGreaterThan(primaryGatewayCall);
    expect(source).not.toContain("resolveChatExecutiveCognition(");
    expect(source).not.toContain("chatExecutiveCognitionPromise");
  });

  // Regression: CUSTOMER_LIST/CALENDAR_OPEN were already suppressed before
  // the model ever streamed a token (fabrication-window fix), but
  // CUSTOMER_LOOKUP wasn't — its own real narration streamed live, then got
  // silently swapped for buildBusinessNavigationMessage's short
  // deterministic line the instant "done" landed. The user watched one
  // answer appear, then saw a different one replace it.
  it("suppresses the live stream for every operation buildBusinessNavigationMessage can deterministically answer, not just some of them", () => {
    expect(source).toContain('businessNavigationOperationEvidence?.operation === "CUSTOMER_LOOKUP"');
    const precomputeStart = source.indexOf("const precomputedBusinessNavigationMessage =");
    const precomputeEnd = source.indexOf(";", source.indexOf("buildBusinessNavigationMessage(businessNavigationPresentationEvidence, calendarClock)", precomputeStart)) + 1;
    const precomputeBlock = source.slice(precomputeStart, precomputeEnd);
    expect(precomputeBlock).toContain('"CUSTOMER_LIST"');
    expect(precomputeBlock).toContain('"CALENDAR_OPEN"');
    expect(precomputeBlock).toContain('"CUSTOMER_LOOKUP"');
    expect(precomputeBlock).toContain('"DOMAIN_LIST"');
    expect(precomputeBlock).toContain("isInformationalCustomerLookup");
  });

  // Structural guarantee against the same class of bug recurring for a
  // future operation type: there is exactly one place that ever calls
  // buildBusinessNavigationMessage. The post-stream override reuses
  // precomputedBusinessNavigationMessage instead of recomputing an
  // independent second copy — so the "what got suppressed" predicate and
  // the "what gets shown instead" predicate can never drift apart again.
  it("computes buildBusinessNavigationMessage's result exactly once, not once for suppression and again for the override", () => {
    const occurrences = source.split("buildBusinessNavigationMessage(businessNavigationPresentationEvidence, calendarClock)").length - 1;
    expect(occurrences).toBe(1);
    expect(source).toContain("const deterministicBusinessNavigationMessage = deterministicHandoffMessage\n            ? null\n            : precomputedBusinessNavigationMessage;");
  });

  // Regression: the workspace-close acknowledgment and the "couldn't confirm
  // this mutation" fallback were computed only after the primary stream had
  // already run — same fabrication-window bug as CUSTOMER_LOOKUP above, just
  // for these two lowest-priority deterministic cases. Confirmed live: the
  // model's own unvetted narration streamed visible before either line
  // silently swapped it out on "done".
  it("suppresses the live stream for the workspace-close and unconfirmed-mutation deterministic cases too", () => {
    const gateStart = source.indexOf("const precomputedDeterministicPrimaryMessage =");
    const gateEnd = source.indexOf(";", gateStart) + 1;
    const gate = source.slice(gateStart, gateEnd);
    expect(gate).toContain("precomputedWorkspaceCloseMessage");
    expect(gate).toContain("precomputedUnconfirmedMutationMessage");
    // Both must be computed (as precomputedWorkspaceCloseMessage /
    // precomputedUnconfirmedMutationMessage) strictly before the gate that
    // reads them, not after — otherwise the gate above would reference a
    // not-yet-declared const.
    const precomputedWorkspaceCloseDecl = source.indexOf("const precomputedWorkspaceCloseMessage =");
    const precomputedUnconfirmedMutationDecl = source.indexOf("const precomputedUnconfirmedMutationMessage =");
    expect(precomputedWorkspaceCloseDecl).toBeGreaterThan(0);
    expect(precomputedWorkspaceCloseDecl).toBeLessThan(gateStart);
    expect(precomputedUnconfirmedMutationDecl).toBeGreaterThan(0);
    expect(precomputedUnconfirmedMutationDecl).toBeLessThan(gateStart);
  });

  // Same structural guarantee as buildBusinessNavigationMessage's own test
  // above, extended to the other two deterministic cases: the post-stream
  // override must reuse the precomputed value, never recompute an
  // independent second copy (which is exactly what let the suppression gate
  // and the override disagree before this fix).
  it("reuses the precomputed workspace-close/unconfirmed-mutation messages for the post-stream override instead of recomputing them", () => {
    expect(source).toContain("const deterministicWorkspaceCloseMessage = precomputedWorkspaceCloseMessage;");
    expect(source).toContain("const deterministicUnconfirmedMutationMessage = precomputedUnconfirmedMutationMessage;");
    expect(source.match(/buildUnconfirmedMutationIntentMessage\(\{/g)).toHaveLength(1);
  });

  // Progressive enrichment ("pipeline C") — the second, independent model
  // call this class of bug used to require guarding turn-by-turn — no
  // longer exists at all (see the two tests above): there is nothing left
  // to append onto any deterministic message, so there is no guard to test.
  it("has no second, independent enrichment model call left to guard against double-narrating a deterministic message", () => {
    expect(source).not.toContain("shouldAppendProgressiveEnrichment(");
    expect(source).not.toContain("function buildProgressiveEnrichmentEvidence(");
    expect(source).not.toContain("function buildProgressiveEnrichmentInstruction(");
    expect(source).not.toContain('requestId: `${requestId}:enrichment`');
  });
});
