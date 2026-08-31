import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

// Phase B — proves the wiring invariants that can't be proven by a live
// network call in CI: internal-truth precedence, single-call-per-turn cost
// control, and that the disposable opening phase (Character Reality 3A)
// never becomes a second research authority.
describe("chat route — external evidence (Phase B) ownership boundary", () => {
  it("routes through the canonical Phase A/B seam, never a raw provider call", () => {
    expect(routeSource).toContain("resolveLiveExternalEvidence");
    expect(routeSource).toContain("buildExternalEvidencePromptLine");
    // Only one call site — one research operation per turn (section 15 cost
    // control), never invoked from inside a loop or a second producer.
    expect(routeSource.match(/resolveLiveExternalEvidence\(/g)?.length).toBe(1);
  });

  it("suppresses external evidence whenever internal business navigation is also present", () => {
    expect(routeSource).toContain(
      "const externalEvidenceNeed = observedNavigation ? null : conversationUnderstanding.externalEvidenceNeed ?? null;",
    );
  });

  it("injects evidence only into the canonical prompt-evidence array, never as a raw client-facing chunk", () => {
    const evidenceLineIndex = routeSource.indexOf("buildExternalEvidencePromptLine(externalEvidenceNeed, externalEvidenceResult)");
    expect(evidenceLineIndex).toBeGreaterThan(0);
    const arrayStart = routeSource.indexOf("const canonicalOperationEvidenceLines = [");
    expect(arrayStart).toBeGreaterThan(0);
    expect(evidenceLineIndex).toBeGreaterThan(arrayStart);
  });

  it("keeps the disposable opening phase research-free — it must never call the evidence seam", () => {
    const openingStart = routeSource.indexOf("function createMetrixOpeningStream");
    expect(openingStart).toBeGreaterThan(0);
    const openingEnd = routeSource.indexOf("\n}\n", openingStart);
    const openingBody = routeSource.slice(openingStart, openingEnd);
    expect(openingBody).not.toContain("resolveLiveExternalEvidence");
    expect(openingBody).not.toContain("collectExternalEvidence");
    expect(openingBody).not.toContain("externalEvidence");
  });
});
