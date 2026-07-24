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
    expect(source).toContain('[UniversalCapture] live conversation capture failed:');
    expect(source).toContain('[KnowledgeAcquisition] detection/memory candidate flow failed:');
    expect(source).toContain('[MemoryCandidates] deferred candidate flow failed:');
    expect(source).toContain("if (!visibleDoneSent)");
    expect(source).toContain("[ConversationFirst] post-response work failed:");
  });

  it("keeps text classification deterministic and voice classification intact", () => {
    expect(source).toContain('"classification_fast_path"');
    expect(source).toContain('"classification_done"');
    expect(source).toContain("fastPath: fastPathResult.matched");
    expect(source).toContain('const classifyPromise = channel === "voice"');
    expect(source).toContain(": Promise.resolve(runtimeResolution.understanding)");
    expect(source).toContain('classificationMode: channel === "voice"');
  });

  it("resolves readiness before classification and starts text intelligence after done", () => {
    expect(source.indexOf('"response_readiness_resolved"')).toBeLessThan(source.indexOf('"classification_start"'));
    expect(source).toContain("startPostStreamIntelligence();");
    expect(source.indexOf("startPostStreamIntelligence();")).toBeGreaterThan(
      source.indexOf('"done_event_sent"'),
    );
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
      .toHaveLength(2);
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
});
