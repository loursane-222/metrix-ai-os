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
});
