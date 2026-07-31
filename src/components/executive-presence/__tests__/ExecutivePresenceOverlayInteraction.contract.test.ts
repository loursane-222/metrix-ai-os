import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const runtime = read("../ExecutivePresenceRuntime.tsx");
const host = read("../ExecutivePresenceHost.tsx");
const panel = read("../ExecutivePresencePanel.tsx");
const conversation = read("../ExecutivePresenceConversation.tsx");
const chat = read("../../metrix-tab/MetrixChatTab.tsx");
const shell = read("../../living-workspace/ExecutiveAppShell.tsx");

describe("Executive Presence overlay interaction boundary", () => {
  it("routes the close control to the canonical open-state owner", () => {
    expect(runtime).toContain("const [isPanelOpen, setIsPanelOpen] = useState(false)");
    expect(runtime).toContain("const closePanel = useCallback(() => setIsPanelOpen(false), [])");
    expect(host).toContain("<ExecutivePresencePanel isOpen={isSurfaceVisible} onClose={closePanel} />");
    expect(host).toContain("closable: true");
    expect(panel).toContain("<ExecutivePresenceConversation onClose={onClose} />");
    expect(conversation).toContain("onClose={onClose}");
    expect(chat).toContain("onClick={onClose}");
  });

  it("does not force the overlay open from full-screen presentation mode", () => {
    expect(host).toContain("const isSurfaceVisible = !isPublicSurfaceHidden && isPanelOpen");
    expect(host).not.toContain("isFullScreen || isPanelOpen");
    expect(panel).toContain("const isVisible = isOpen");
    expect(panel).not.toContain("isFullScreen || isOpen");
  });

  it("keeps a dismissed mounted surface non-interactive and owns one overlay", () => {
    expect(panel.match(/pointer-events-none invisible/g)).toHaveLength(2);
    expect(host.match(/<ExecutivePresencePanel\b/g)).toHaveLength(1);
    expect(panel.match(/<ExecutivePresenceConversation\b/g)).toHaveLength(1);
  });

  it("leaves shell history, settings, conversation, and composer ownership intact", () => {
    expect(shell).toContain("headerActionsRef.current?.openHistory()");
    expect(shell).toContain("headerActionsRef.current?.toggleSettings()");
    expect(chat).toContain("<HistorySheet");
    expect(chat).toContain("<SettingsMenu");
    expect(chat).toContain('placeholder={');
    expect(chat).toContain('ref={textareaRef}');
  });
});
