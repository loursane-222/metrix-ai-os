import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../MetrixChatTab.tsx", import.meta.url)),
  "utf8",
);
const globalStyles = readFileSync(
  fileURLToPath(new URL("../../../app/globals.css", import.meta.url)),
  "utf8",
);
const ecosystem = readFileSync(
  fileURLToPath(new URL("../MetrixEcosystemField.tsx", import.meta.url)),
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
    expect(source).toContain('className="metrix-main-composer shrink-0');
    expect(globalStyles).toContain("bottom:max(16px,env(safe-area-inset-bottom))");
  });

  it("uses a deterministic mobile ecosystem projection without duplicating the composer", () => {
    expect(globalStyles).toContain(".metrix-network-mobile { display:none; }");
    expect(globalStyles).toContain(".metrix-network-desktop { display:none; }");
    expect(globalStyles).toContain("width:calc(100vw - 24px)");
    expect(globalStyles).toContain("@media (min-width:901px) and (max-height:820px)");
    expect(source.match(/data-conversation-composer/g)).toHaveLength(2);
    expect(source.match(/metrix-main-composer shrink-0/g)).toHaveLength(2);
  });

  it("maps every projected Main domain to a distinct semantic SVG icon", () => {
    for (const icon of ["IconTasks", "IconChart", "IconPackage", "IconUsers", "IconWallet", "IconFileText", "IconTruck", "IconFactory"]) {
      expect(ecosystem).toContain(`${icon} className={className}`);
    }
    expect(ecosystem).toContain('{ key: "order", label: "Siparişler"');
    expect(ecosystem).toContain('{ key: "delivery", label: "Teslimatlar"');
    expect(ecosystem).not.toMatch(/icon: "people"|icon: "bars"|icon: "document"/);
  });

  it("keeps one stream owner for written and voice delivery", () => {
    expect(source).toContain("pendingVoiceCanonicalRef");
    expect(source).toContain("const finalContent = resolveNavigationAssistantContent(ai.content || streamed, navigationCompletion)");
    expect(source).not.toContain("suppressNextNativeAssistantRef");
    expect(source).toContain("const heard = revealedTextAtInterrupt.trim()");
  });
});
