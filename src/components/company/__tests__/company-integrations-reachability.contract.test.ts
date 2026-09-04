import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../CompanyOperatingScreen.tsx", import.meta.url), "utf8");

/**
 * Integrations Workspace Reachability Fix. C) "iCloud takvimimi bağlamak
 * istiyorum." must not just open the Şirketim surface — it must land on the
 * Entegrasyonlar tab (where IcloudPanel already lives, shipped in the
 * previous iCloud Calendar Connector operation) so the connect form is
 * actually visible/reachable in the same turn, not one extra manual click
 * away. This is a static contract test (mirrors the codebase's established
 * source-text pattern for surfaces with no request-level render harness)
 * proving the requestedSection prop actually drives the initial tab.
 */
describe("CompanyOperatingScreen — requestedSection reaches the Entegrasyonlar tab", () => {
  it("accepts requestedSection and uses it for the initial tab, defaulting to Genel Bakış otherwise", () => {
    expect(source).toContain('requestedSection }: { onReady?: () => void; requestId?: string; requestedSection?: "integrations"');
    expect(source).toContain('useState(() => (requestedSection === "integrations" ? "Entegrasyonlar" : "Genel Bakış"))');
  });

  it("re-applies the section exactly once per new navigation request, never overriding a manual tab click afterwards — same pattern as CalendarWorkspace's requestId authority", () => {
    expect(source).toContain("appliedRequestRef.current === requestId");
    expect(source).toContain('setActive("Entegrasyonlar")');
  });

  it("Entegrasyonlar tab still renders the existing iCloud connect form — no second/duplicate integrations surface introduced by this fix", () => {
    expect(source).toContain('active === "Entegrasyonlar" ?');
    expect(source).toContain("<IcloudPanel");
    expect((source.match(/function IcloudPanel/g) ?? []).length).toBe(1);
  });
});
