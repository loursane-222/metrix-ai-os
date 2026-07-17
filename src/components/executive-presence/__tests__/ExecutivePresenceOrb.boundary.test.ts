import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const hostSource = read("../ExecutivePresenceHost.tsx");
const orbSource = read("../ExecutivePresenceOrb.tsx");
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
    expect(orbSource).toContain('src="/design/primary-orb.svg"');
    expect(orbSource).toContain('aria-label="Metrix ile konuş"');
  });

  it("opens the shared runtime panel without owning conversation state", () => {
    expect(orbSource).toContain("const { openPanel } = useExecutivePresence()");
    expect(orbSource).toContain("onClick={openPanel}");
    expect(orbSource).not.toContain("MetrixChatTab");
    expect(orbSource).not.toMatch(/useState|usePathname|href=/);
  });

  it("keeps one compact conversation projection and no page-local triggers", () => {
    expect(hostSource.match(/<ExecutivePresenceConversation\s*\/>/g)).toHaveLength(1);
    expect(conversationSource.match(/<MetrixChatTab\b/g)).toHaveLength(1);
    expect(customerEditSource).not.toMatch(/openPanel|Metrix ile konu|>\s*METRIX\s*</);
    expect(workspaceSource).not.toMatch(/openPanel|METRIX ↗|Metrix ile konus/);
  });

  it("keeps the Executive Dock center navigation targeting /metrix", () => {
    expect(customersDockSource).toContain('{ label: "Metrix", href: "/metrix" }');
  });
});
