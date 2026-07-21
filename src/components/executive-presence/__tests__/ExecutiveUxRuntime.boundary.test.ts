import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("Executive UX runtime boundaries", () => {
  const chat = read("../../metrix-tab/MetrixChatTab.tsx");
  const host = read("../ExecutivePresenceHost.tsx");
  const runtime = read("../ExecutivePresenceRuntime.tsx");
  const focus = read("../ExecutivePageFocusHost.tsx");
  const conversation = read("../ExecutivePresenceConversation.tsx");

  it("opens compact command UI on business routes and preserves /metrix suppression", () => {
    expect(chat).toContain('presentation === "command"');
    expect(conversation).toContain('presentation="command"');
    expect(runtime).toContain('pathname === "/" || pathname === "/metrix" ? "full-screen" : "floating"');
    expect(host).toContain('presentationMode === "floating" ? <ExecutivePresenceOrb /> : null');
  });

  it("opens full conversation only through an explicit action", () => {
    expect(runtime).toContain('router.push("/metrix")');
    expect(chat).toContain("Full conversation →");
  });

  it("keeps voice and text on the same send function and activity session", () => {
    expect(chat).toContain("void send(text, true)");
    expect(chat).toContain("void send()");
    expect(chat).toContain("activitySnapshot.items.map");
  });

  it("resolves only declarative focus metadata and gracefully no-ops", () => {
    expect(focus).toContain("data-executive-target");
    expect(focus).toContain("if (!target) return");
  });
});
