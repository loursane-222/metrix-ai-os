import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
const artifactServiceSource = readFileSync(
  new URL("../../../../../lib/artifacts/collections-artifact.service.ts", import.meta.url),
  "utf8",
);

describe("chat route — Phase D1 artifact ownership boundary", () => {
  it("generates the artifact through the single canonical seam, once per turn", () => {
    expect(routeSource).toContain("generateCollectionsArtifact");
    expect(routeSource.match(/generateCollectionsArtifact\(/g)?.length).toBe(1);
  });

  it("suppresses the artifact request whenever internal business navigation is also present", () => {
    expect(routeSource).toContain(
      "const artifactRequest = observedNavigation ? null : conversationUnderstanding.artifactRequest ?? null;",
    );
  });

  it("only attaches a deliverable file to the response when generation actually succeeded — never a phantom link", () => {
    expect(routeSource).toContain('artifactOutcome?.status === "GENERATED"');
    expect(routeSource).toContain("const deliverableArtifact = artifactOutcome?.status === \"GENERATED\"\n      ? buildDeliverableArtifactPayload(artifactOutcome.file)\n      : null;");
  });

  it("injects artifact evidence only into the canonical prompt-evidence array, never as a raw client-facing chunk", () => {
    const evidenceLineIndex = routeSource.indexOf("artifactOutcome ? buildCollectionsArtifactPromptLine(artifactOutcome) : null");
    const arrayStart = routeSource.indexOf("const canonicalOperationEvidenceLines = [");
    expect(evidenceLineIndex).toBeGreaterThan(arrayStart);
  });

  it("keeps the disposable opening phase artifact-free — it must never generate a file", () => {
    const openingStart = routeSource.indexOf("function createMetrixOpeningStream");
    const openingEnd = routeSource.indexOf("\n}\n", openingStart);
    const openingBody = routeSource.slice(openingStart, openingEnd);
    expect(openingBody).not.toContain("generateCollectionsArtifact");
    expect(openingBody).not.toContain("Artifact");
  });

  it("the artifact generation module never calls any external evidence tool (Phase D1 section 18)", () => {
    expect(artifactServiceSource).not.toContain("resolveLiveExternalEvidence");
    expect(artifactServiceSource).not.toContain("collectExternalEvidence");
    expect(artifactServiceSource).not.toContain("createWebResearchEvidenceTool");
  });
});
