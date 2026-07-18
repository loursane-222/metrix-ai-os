import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const contextSource = read("../ExecutivePresenceContext.ts");
const runtimeSource = read("../ExecutivePresenceRuntime.tsx");
const hostSource = read("../ExecutivePresenceHost.tsx");
const orbSource = read("../ExecutivePresenceOrb.tsx");
const panelSource = read("../ExecutivePresencePanel.tsx");
const fullScreenSource = read("../ExecutivePresenceFullScreen.tsx");
const metrixPageSource = read("../../../app/metrix/page.tsx");

describe("Executive Presence React runtime boundary", () => {
  it("constructs one stable behavior adapter independent of route and presentation renders", () => {
    expect(runtimeSource).toContain(
      "useRef<ExecutivePresenceBehaviorAdapter | null>(null)",
    );
    expect(runtimeSource).toContain("if (behaviorAdapterRef.current === null)");
    expect(runtimeSource).toContain(
      "behaviorAdapterRef.current = createExecutivePresenceBehaviorAdapter()",
    );
    expect(runtimeSource).toContain("const behaviorAdapter = behaviorAdapterRef.current");
    expect(runtimeSource).not.toContain("useState(createExecutivePresenceBehaviorAdapter)");
    expect(runtimeSource.match(/createExecutivePresenceBehaviorAdapter/g)).toHaveLength(2);
    expect(runtimeSource).toContain("pathname === \"/metrix\"");
    expect(runtimeSource).not.toMatch(
      /behaviorAdapterRef\.current\s*=\s*createExecutivePresenceBehaviorAdapter\([^)]*pathname/,
    );
    expect(runtimeSource).toContain("behaviorAdapter.destroy()");
  });

  it("subscribes context to the canonical external-store snapshot", () => {
    expect(runtimeSource).toContain("useSyncExternalStore(");
    expect(runtimeSource).toContain("behaviorAdapter.subscribe");
    expect(runtimeSource).toContain("behaviorAdapter.getSnapshot");
    expect(contextSource).toContain("behaviorSnapshot: ExecutivePresenceSnapshot");
    expect(contextSource).toContain("publishPresenceEvent: (event: ExecutivePresenceEvent) => void");
  });

  it("keeps presentation state visibly separate and exposes no status setter", () => {
    expect(contextSource).not.toMatch(/set(?:Presence)?Status/i);
    expect(runtimeSource).not.toMatch(/useState\([^\n]*(?:listening|thinking|completed|error)/);
  });

  it("projects the same context snapshot to every presentation", () => {
    for (const source of [orbSource, panelSource, fullScreenSource]) {
      expect(source).toContain("behaviorSnapshot");
      expect(source).toContain("data-presence-status={behaviorSnapshot.status}");
      expect(source).not.toMatch(/set(?:Presence)?Status/i);
    }
  });

  it("does not reset behavior on route or presentation changes", () => {
    expect(runtimeSource).toContain(
      "useEffect(() => () => behaviorAdapter.destroy(), [behaviorAdapter])",
    );
    expect(runtimeSource).not.toContain("[pathname, behaviorAdapter]");
    expect(runtimeSource).not.toMatch(/behaviorAdapter\s*=.*pathname/);
  });

  it("suppresses only the floating host on the full-screen /metrix route", () => {
    expect(runtimeSource).toContain(
      'pathname === "/metrix" ? "full-screen" : "floating"',
    );
    expect(hostSource).toContain('if (presentationMode === "full-screen") return null');
    expect(hostSource).toContain("<ExecutivePresenceOrb />");
    expect(metrixPageSource).toContain("<ExecutivePresenceFullScreen />");
    expect(fullScreenSource).toContain("<ExecutivePresenceConversation />");
  });
});
