import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../MetrixChatTab.tsx", import.meta.url)),
  "utf8",
);

describe("MetrixChatTab conversation viewport boundary", () => {
  it("tracks the real scroll container and uses deterministic direct scrolling", () => {
    expect(source).toContain("ref={messagesContainerRef}");
    expect(source).toContain("onScroll={(event) =>");
    expect(source).toContain("container.scrollTop = container.scrollHeight");
    expect(source).not.toContain("scrollIntoView");
    expect(source).not.toContain('behavior: "smooth"');
  });

  it("coalesces DOM scroll work and cancels it on cleanup", () => {
    expect(source).toContain("createFrameScheduler(requestAnimationFrame, cancelAnimationFrame)");
    expect(source).toContain("return () => viewportFrameRef.current?.cancel()");
  });

  it("distinguishes assistant generations from streaming growth", () => {
    expect(source).toContain("assistantGenerationRef");
    expect(source).toContain("startNewAssistantMessage()");
    expect(source).toContain("updateAssistantMessage(viewportStateRef.current, generation)");
    expect(source).toContain("finishActiveTextMessage()");
  });

  it("keeps history modal toggles out of the viewport policy", () => {
    const openHistory = source.slice(
      source.indexOf("function openHistory()"),
      source.indexOf("async function selectHistoryItem"),
    );
    expect(openHistory).not.toMatch(/transitionViewport|startNewAssistantMessage/);
    expect(source).toMatch(
      /setMessages\(json\.data\.messages\);[\s\S]*?restoreConversation\(viewportStateRef\.current\)/,
    );
  });

  it("preserves the flex layout and safe-area contract above the composer", () => {
    expect(source).toContain('className="min-h-0 flex-1 overflow-y-auto');
    expect(source).toContain('className="shrink-0 border-t');
    expect(source).toContain('paddingBottom: "max(env(safe-area-inset-bottom), 12px)"');
  });

  it("does not change voice ownership and delayed commit guards", () => {
    expect(source).toContain("pendingVoiceMessageRef.current = { content: text }");
    expect(source).toContain('orchestrator.presence.kind !== "listening"');
    expect(source).toContain("suppressNextNativeAssistantRef.current");
    expect(source).toContain("const heard = revealedTextAtInterrupt.trim()");
  });
});
