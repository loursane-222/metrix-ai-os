import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shell = readFileSync(fileURLToPath(new URL("../ApprovedDomainWorkspace.tsx", import.meta.url)), "utf8");
const canonical = readFileSync(fileURLToPath(new URL("../CanonicalDomainSurface.tsx", import.meta.url)), "utf8");
const resolver = readFileSync(fileURLToPath(new URL("../BusinessSurfaceResolver.tsx", import.meta.url)), "utf8");

describe("Approved Domain Workspace presentation contract", () => {
  it("keeps the shared shell presentation-only", () => {
    expect(shell).not.toMatch(/@\/lib\/|fetch\(|livingWorkspaceRuntime|dispatchConversationNavigation/);
    expect(shell).toContain("data-approved-domain-workspace");
    expect(shell).toContain("approved-domain-kpis");
    expect(shell).toContain("approved-domain-toolbar");
    expect(shell).toContain("approved-domain-pagination");
  });

  it("derives domain content from canonical adapters and preserves real row handlers", () => {
    expect(canonical).toContain("DOMAIN_SURFACE_ADAPTERS[directive.domain]");
    expect(canonical).toContain("adapter.summaryMetrics");
    expect(canonical).toContain('adapter.supportedQuickActions.includes("open-detail") ? () => openRow(row) : undefined');
    expect(canonical).toContain("PaymentCollectionAccessory");
    expect(canonical).not.toContain("Toplam Ciro");
    expect(canonical).not.toContain("Ortalama Vade");
  });

  it("keeps calendar outside the canonical list shell", () => {
    expect(resolver).toContain('if (directive.businessSurface === "calendar") return <CalendarWorkspace');
    expect(resolver).toMatch(/CANONICAL_SURFACES = \[[\s\S]*?\]/);
    const canonicalList = resolver.match(/CANONICAL_SURFACES = \[([\s\S]*?)\]/)?.[1] ?? "";
    expect(canonicalList).not.toContain("calendar");
  });
});
