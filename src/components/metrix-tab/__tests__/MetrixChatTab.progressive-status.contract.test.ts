import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../MetrixChatTab.tsx", import.meta.url), "utf8");

describe("MetrixChatTab progressive status contract", () => {
  it("keeps status outside messages and binds it to the active turn", () => {
    expect(source).toContain("type TransientStatus = { turnId: string;");
    expect(source).toContain("setTransientStatus(readiness?.statusCategory");
    expect(source).toContain("current?.turnId === turn.turnId ? null : current");
    expect(source).not.toContain('{ role: "metrix", content: readiness.statusContent');
  });

  it("clears status on real content and all terminal/cancellation boundaries", () => {
    expect(source).toContain("if (content && activeTextGenerationRef.current === null)");
    expect(source.match(/setTransientStatus\(null\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("function cancelActiveWork()");
    expect(source).toContain("async function selectHistoryItem(id: string)");
    expect(source).toContain("function startNewConversation()");
  });

  it("renders one accessible non-message status instead of duplicate loading", () => {
    expect(source).toContain("transientStatus ? <RuntimeStatus status={transientStatus} /> : <ThinkingBubble />");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('className="min-h-[52px] select-none"');
  });
});
