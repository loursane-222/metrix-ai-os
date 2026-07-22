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
  });

  it("keeps fast-path telemetry and bypasses the provider promise", () => {
    expect(source).toContain('"classification_fast_path"');
    expect(source).toContain('"classification_done"');
    expect(source).toContain("fastPath: fastPathResult.matched");
    expect(source).toContain("fastPathResult.matched\n      ? Promise.resolve(fastPathResult.understanding)\n      : classifyConversation({ message })");
  });

  it("resolves readiness before classification and does not block immediate generation on learning", () => {
    expect(source.indexOf('"response_readiness_resolved"')).toBeLessThan(source.indexOf('"classification_start"'));
    expect(source).toContain('responseReadiness.mode === "immediate"\n      ? null\n      : await learningLoopPromise');
    expect(source).toContain('"status_to_first_real_chunk_ms"');
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
