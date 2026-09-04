import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

// Same reasoning as external-evidence-boundary.contract.test.ts, for the
// Google (Gmail + Calendar) evidence seam: proves route.ts routes through
// Company Intelligence's one orchestration function, never a raw Gmail/
// Calendar/Google ConnectorAdapter call, and never invokes it for a turn
// detectGoogleEvidenceNeed decided doesn't need it.
describe("chat route — Google (Gmail + Calendar) evidence ownership boundary", () => {
  it("routes through the canonical Company Intelligence seam, never a raw Google service/adapter call", () => {
    expect(routeSource).toContain("detectGoogleEvidenceNeed");
    expect(routeSource).toContain("resolveGoogleEvidence");
    expect(routeSource).toContain("buildGoogleEvidencePromptLine");
    expect(routeSource).not.toContain("googleConnectorAdapter.read(");
    expect(routeSource).not.toContain("listRecentGmailMessages(");
    expect(routeSource).not.toContain("listUpcomingCalendarEvents(");
    // One call site — one Google evidence resolution per turn.
    expect(routeSource.match(/resolveGoogleEvidence\(/g)?.length).toBe(1);
  });

  it("never resolves Google evidence for a turn detectGoogleEvidenceNeed found no need for", () => {
    expect(routeSource).toContain(
      "const googleEvidencePromise = googleEvidenceNeed\n      ? resolveGoogleEvidence(googleEvidenceNeed",
    );
  });

  it("injects evidence only into the canonical prompt-evidence array, never as a raw client-facing chunk", () => {
    const evidenceLineIndex = routeSource.indexOf("buildGoogleEvidencePromptLine(googleEvidenceNeed, googleEvidenceResult)");
    expect(evidenceLineIndex).toBeGreaterThan(0);
    const arrayStart = routeSource.indexOf("const canonicalOperationEvidenceLines = [");
    expect(arrayStart).toBeGreaterThan(0);
    expect(evidenceLineIndex).toBeGreaterThan(arrayStart);
  });

  it("keeps the disposable opening phase Google-evidence-free — it must never call the evidence seam", () => {
    const openingStart = routeSource.indexOf("function createMetrixOpeningStream");
    expect(openingStart).toBeGreaterThan(0);
    const openingEnd = routeSource.indexOf("\n}\n", openingStart);
    const openingBody = routeSource.slice(openingStart, openingEnd);
    expect(openingBody).not.toContain("resolveGoogleEvidence");
    expect(openingBody).not.toContain("googleConnectorAdapter");
  });
});
