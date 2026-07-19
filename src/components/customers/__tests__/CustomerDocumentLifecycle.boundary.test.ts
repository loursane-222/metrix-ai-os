import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("../CustomerDocumentIngestionPanel.tsx", import.meta.url)), "utf8");

describe("Customer document lifecycle adapter boundary", () => {
  it("publishes only around real upload, extraction, preview and handoff transitions", () => {
    expect(source).toContain('emit("document", "uploaded"');
    expect(source).toContain('emit("extraction", "extracting"');
    expect(source).toContain('emit("extraction", "extracted"');
    expect(source).toContain('emit("preview", "preview_ready"');
    expect(source).toContain('emit("preview", "draft_handoff"');
    expect(source).toContain('emit("extraction", "failed"');
    expect(source).toContain('emit("preview", "cancelled"');
  });

  it("does not place extracted candidates or full document content in envelopes", () => {
    const emitHelper = source.slice(source.indexOf("function emit("), source.indexOf("async function upload"));
    expect(emitHelper).not.toMatch(/candidates|normalizedValue|evidence|content/);
  });
});
