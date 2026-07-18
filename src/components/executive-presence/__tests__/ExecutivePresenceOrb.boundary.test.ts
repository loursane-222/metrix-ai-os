import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const hostSource = read("../ExecutivePresenceHost.tsx");
const orbSource = read("../ExecutivePresenceOrb.tsx");
const panelSource = read("../ExecutivePresencePanel.tsx");
const conversationSource = read("../ExecutivePresenceConversation.tsx");
const runtimeSource = read("../ExecutivePresenceRuntime.tsx");
const customerEditSource = read("../../customers/CustomerEditScreen.tsx");
const workspaceSource = read("../../metrix-workspace/MetrixWorkspace.tsx");
const customersDockSource = read("../../customers/CustomersBottomNav.tsx");

describe("Executive Presence orb ownership boundary", () => {
  it("renders the one global orb from the floating host only", () => {
    expect(hostSource.match(/<ExecutivePresenceOrb\s*\/>/g)).toHaveLength(1);
    expect(hostSource).toContain('presentationMode === "full-screen"');
    expect(runtimeSource).toContain('pathname === "/metrix" ? "full-screen" : "floating"');
    expect(orbSource).toContain('src="/design/executive-presence-orb.png"');
    expect(orbSource).toContain("object-contain");
    expect(orbSource).not.toMatch(/top-\[|w-\[300%\]|translate-x/);
    expect(orbSource).toContain('aria-label="Metrix ile konuş"');
  });

  it("opens the shared runtime panel without owning conversation state", () => {
    expect(orbSource).toContain("const { behaviorSnapshot, openPanel } = useExecutivePresence()");
    expect(orbSource).toContain("onClick={handleClick}");
    expect(orbSource).toContain("openPanel();");
    expect(orbSource).toContain("if (suppressClickRef.current)");
    expect(orbSource).not.toContain("MetrixChatTab");
    expect(orbSource).not.toMatch(/usePathname|href=/);
  });

  it("uses one captured primary pointer for drag without native draggable behavior", () => {
    expect(orbSource).toContain("onPointerDown={handlePointerDown}");
    expect(orbSource).toContain("onPointerMove={handlePointerMove}");
    expect(orbSource).toContain("onPointerUp={finishPointerInteraction}");
    expect(orbSource).toContain("onPointerCancel={finishPointerInteraction}");
    expect(orbSource).toContain("setPointerCapture(event.pointerId)");
    expect(orbSource).toContain("releasePointerCapture(event.pointerId)");
    expect(orbSource).toContain("touch-none");
    expect(orbSource).toContain("EXECUTIVE_ORB_POSITION_STORAGE_KEY");
    expect(orbSource).not.toContain("draggable={true}");
  });

  it("re-clamps on resize and cleans up the listener", () => {
    expect(orbSource).toContain('window.addEventListener("resize", handleResize)');
    expect(orbSource).toContain('window.removeEventListener("resize", handleResize)');
    expect(orbSource).toContain("clampOrbPosition(currentPosition, bounds)");
  });

  it("keeps one compact conversation projection and no page-local triggers", () => {
    expect(hostSource.match(/<ExecutivePresencePanel\b/g)).toHaveLength(1);
    expect(panelSource.match(/<ExecutivePresenceConversation\s*\/>/g)).toHaveLength(1);
    expect(conversationSource.match(/<MetrixChatTab\b/g)).toHaveLength(1);
    expect(customerEditSource).not.toMatch(/openPanel|Metrix ile konu|>\s*METRIX\s*</);
    expect(workspaceSource).not.toMatch(/openPanel|METRIX ↗|Metrix ile konus/);
  });

  it("keeps orb open and panel close wired to the shared runtime", () => {
    expect(orbSource).toContain("onClick={handleClick}");
    expect(hostSource).toContain("isOpen={isPanelOpen}");
    expect(hostSource).toContain("onClose={closePanel}");
  });

  it("keeps the Executive Dock center navigation targeting /metrix", () => {
    expect(customersDockSource).toContain('{ label: "Metrix", href: "/metrix" }');
  });
});
