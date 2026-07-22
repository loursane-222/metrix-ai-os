import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");

describe("Metrix chat continuity contract", () => {
  it("commits a completed voice message when a new microphone turn interrupts playback", () => {
    expect(source).toContain("const completed = pendingVoiceMessageRef.current;");
    expect(source).toContain("const durableText = completed?.content.trim() || heard;");
    expect(source).toContain('setMessages((prev) => [...prev, { role: "metrix", content: durableText }])');
  });

  it("guards old cleanup and treats a stream without a terminal event as an error", () => {
    expect(source).toContain("if (activeRequestRef.current !== requestController) return;");
    expect(source).toContain("if (!terminalEventSeen && submitControllerRef.current.isCurrent(turn))");
    expect(source).toContain('finishSubmit("error", "Conversation stream ended without a terminal event")');
  });

  it("paints the first delta immediately and reconciles done into one durable message", () => {
    expect(source).toContain("streamingContentRef.current = content;");
    expect(source).toContain("setStreamingContent(content);");
    expect(source).toContain("requestAnimationFrame(() =>");
    expect(source).toContain("const finalContent = ai.content || streamed;");
    expect(source).toContain('setMessages((prev) => [...prev, { role: "metrix", content: finalContent }])');
    expect(source).not.toContain("slice(0, 6)");
    expect(source).toContain("if (!submitControllerRef.current.isCurrent(turn)) return;");
  });
});
