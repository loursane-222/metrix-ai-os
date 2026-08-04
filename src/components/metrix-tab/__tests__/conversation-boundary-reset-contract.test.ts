import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Source-contract test, same style as
// src/app/api/ai/chat/__tests__/single-authority-source-contract.test.ts.
// Proves the two conversation-change entry points (starting a new
// conversation, selecting a different one from history) both route through
// the single canonical reset boundary — resetActiveConversationExtensionState
// — instead of each duplicating its own stale-surface cleanup independently.
const source = readFileSync(new URL("../MetrixChatTab.tsx", import.meta.url), "utf8");

function extractFunctionBody(fnName: string): string {
  const start = source.indexOf(`function ${fnName}(`);
  expect(start, `${fnName} not found in MetrixChatTab.tsx`).toBeGreaterThan(-1);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Unbalanced braces while extracting ${fnName}`);
}

describe("conversation-change reset boundary source contract", () => {
  it("startNewConversation() calls the single canonical reset boundary", () => {
    expect(extractFunctionBody("startNewConversation")).toContain("resetActiveConversationExtensionState()");
  });

  it("selectHistoryItem() calls the single canonical reset boundary", () => {
    expect(extractFunctionBody("selectHistoryItem")).toContain("resetActiveConversationExtensionState()");
  });

  it("does not duplicate Living Workspace or surface-channel cleanup locally instead of using the shared boundary", () => {
    expect(source).not.toContain("livingWorkspaceRuntime");
    expect(source).not.toContain("invalidateCustomerCreateSurfaceOwnership");
    expect(source).not.toContain("invalidateCustomerEditSurfaceOwnership");
    expect(source).not.toContain("invalidateOfferEditSurfaceOwnership");
    expect(source).not.toContain("invalidateTaskCreateSurfaceOwnership");
  });

  it("imports the reset boundary from the single conversation-extensions authority", () => {
    expect(source).toContain('from "@/lib/conversation-extensions/active-conversation-extension"');
  });
});
