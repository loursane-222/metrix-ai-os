import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const fullScreen = read("../ExecutivePresenceFullScreen.tsx");
const host = read("../ExecutivePresenceHost.tsx");
const panel = read("../ExecutivePresencePanel.tsx");
const conversation = read("../ExecutivePresenceConversation.tsx");
const runtime = read("../ExecutivePresenceRuntime.tsx");
const chat = read("../../metrix-tab/MetrixChatTab.tsx");
const orchestrator = read(
  "../../metrix-tab/voice/useVoiceExperienceOrchestrator.ts",
);

describe("Executive Presence single persistent conversation owner", () => {
  it("keeps the full-screen route as a shell without a second conversation", () => {
    expect(fullScreen).not.toContain("ExecutivePresenceConversation");
    expect(fullScreen).not.toContain("MetrixChatTab");
    expect(fullScreen).toContain("mountChatContent()");
    expect(fullScreen).toContain('className="h-dvh min-h-0 overflow-hidden bg-[#faf8f3]"');
  });

  it("has exactly one host-panel-conversation-chat mount path", () => {
    expect(host.match(/<ExecutivePresencePanel\b/g)).toHaveLength(1);
    expect(panel.match(/<ExecutivePresenceConversation\b/g)).toHaveLength(1);
    expect(conversation.match(/<MetrixChatTab\b/g)).toHaveLength(1);
    expect(host).not.toContain("ExecutivePresenceConversation");
    expect(fullScreen).not.toContain("ExecutivePresenceConversation");
  });

  it("keeps the same panel mounted across full-screen and floating presentation", () => {
    expect(runtime).toContain(
      'pathname === "/metrix" ? "full-screen" : pathname === "/" ? "hidden" : "floating"',
    );
    expect(host).toContain(
      "!isPublicSurfaceHidden && (isFullScreen || hasChatContentMounted)",
    );
    expect(host).toContain("{shouldMountChatContent ? (");
    expect(host.match(/<ExecutivePresencePanel\b/g)).toHaveLength(1);
  });

  it("makes full-screen visible independently from floating open state", () => {
    expect(panel).toContain(
      'const isFullScreen = presentationMode === "full-screen"',
    );
    expect(panel).toContain("const isVisible = isFullScreen || isOpen");
    expect(panel).toContain("aria-hidden={!isVisible}");
    expect(panel).toContain(
      '"fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-[#faf8f3]"',
    );
    expect(panel).toContain(
      'isVisible ? "" : "pointer-events-none invisible"',
    );
  });

  it("keeps floating geometry, close behavior, and orb ownership unchanged", () => {
    expect(panel).toContain(
      "bottom-[calc(92px+env(safe-area-inset-bottom))]",
    );
    expect(panel).toContain("rounded-[24px]");
    expect(panel).toContain("md:w-[390px]");
    expect(panel).toContain("if (!isVisible || isFullScreen) return");
    expect(host).toContain(
      'presentationMode === "floating" ? <ExecutivePresenceOrb /> : null',
    );
  });

  it("registers full-screen as visible and active without changing input authority", () => {
    expect(host).toContain(
      "const isSurfaceVisible = !isPublicSurfaceHidden && (isFullScreen || isPanelOpen)",
    );
    expect(host).toContain(
      'visibility: isSurfaceVisible ? "visible" : "hidden"',
    );
    expect(host).toContain("active: isSurfaceVisible");
    expect(host).toContain("open: isSurfaceVisible");
    expect(host).toContain("useUniversalInputRegistrations(registrations)");
  });

  it("isolates the public login route from every Executive Presence surface", () => {
    expect(runtime).toContain('pathname === "/" ? "hidden" : "floating"');
    expect(runtime).not.toContain('pathname === "/" || pathname === "/metrix"');
    expect(host).toContain(
      'const isPublicSurfaceHidden = presentationMode === "hidden"',
    );
    expect(host).toContain(
      "!isPublicSurfaceHidden && (isFullScreen || hasChatContentMounted)",
    );
    expect(host).toContain("isPublicSurfaceHidden ? [] : [");
    expect(host).toContain(
      'presentationMode === "floating" ? <ExecutivePresenceOrb /> : null',
    );
  });

  it("does not modify chat submission or voice orchestration ownership", () => {
    expect(chat).toContain("async function send(");
    expect(chat).toContain('fetch("/api/ai/chat"');
    expect(orchestrator).toContain(
      "export function useVoiceExperienceOrchestrator(",
    );
  });
});
