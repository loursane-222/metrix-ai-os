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
    expect(source.indexOf('phase: "enrichment"')).toBeLessThan(source.indexOf('"done_event_sent"'));
    expect(source).toContain('"status_to_first_real_chunk_ms"');
  });

  it("overlaps user-message persistence with gateway preparation", () => {
    expect(source).toContain("const userMessagePromise = sendUserMessage({");
    expect(source.indexOf("const userMessagePromise = sendUserMessage({")).toBeLessThan(
      source.indexOf("await streamWithAiGateway({"),
    );
    const streamingPreGateway = source.slice(
      source.indexOf("// Conversation First: text cognition"),
      source.indexOf("await streamWithAiGateway({"),
    );
    expect(streamingPreGateway).not.toContain("await userMessagePromise");
  });

  it("builds one request-scoped memory context and reuses it", () => {
    expect(source.match(/const requestMemoryContext = buildMemoryContextFromItems/g))
      .toHaveLength(1);
    expect(source.match(/preloadedMemoryContext: requestMemoryContext/g))
      .toHaveLength(3);
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
    expect(source.indexOf('phase: "enrichment"')).toBeLessThan(
      source.indexOf('"done_event_sent"'),
    );
    expect(source).toContain("const executiveOperatingSystem = null;");
    expect(source).toContain("contextProfile: runtimeResolution.contextProfile");
    expect(source).toContain("executiveOperatingSystem,\n      requiresExecutiveReasoning,");
    expect(source).toContain(
      "preloadedMemoryContext: requestMemoryContext",
    );
  });
});
