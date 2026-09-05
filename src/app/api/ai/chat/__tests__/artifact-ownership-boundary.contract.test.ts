import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
const artifactServiceSource = readFileSync(
  new URL("../../../../../lib/artifacts/collections-artifact.service.ts", import.meta.url),
  "utf8",
);
const artifactToolSource = readFileSync(
  new URL("../../../../../lib/executive-agent/tools/artifact-tool.ts", import.meta.url),
  "utf8",
);

/**
 * Grand Consolidation Operation (follow-up correction 1): the METRIX
 * Executive Agent is now the sole semantic owner of artifact generation.
 * route.ts no longer calls generateCollectionsArtifact directly or
 * pre-computes a deliverable — the Agent's own generate_collections_artifact
 * tool (src/lib/executive-agent/tools/artifact-tool.ts) is the single seam,
 * reading the same canonical Settlement dataset and calling the same
 * renderer this used to call directly. There is exactly one artifact
 * delivery owner.
 */
describe("chat route — artifact ownership boundary", () => {
  it("route.ts no longer calls generateCollectionsArtifact directly — the Executive Agent's tool is the only caller", () => {
    expect(routeSource).not.toContain("generateCollectionsArtifact(");
    expect(artifactToolSource).toContain("generateCollectionsArtifact(");
    expect(artifactToolSource.match(/generateCollectionsArtifact\(/g)?.length).toBe(1);
  });

  it("suppresses the artifact request whenever internal business navigation is also present", () => {
    expect(routeSource).toContain(
      "const artifactRequest = observedNavigation ? null : conversationUnderstanding.artifactRequest ?? null;",
    );
  });

  it("routes an artifactRequest turn to the Executive Agent, and only attaches a deliverable when the Agent's own tool actually generated one", () => {
    expect(routeSource).toContain("Boolean(artifactRequest)");
    expect(routeSource).toContain("artifact: agentRunResult?.deliverableArtifact ?? null");
    // The Agent tool itself never fabricates a deliverable on failure/empty.
    expect(artifactToolSource).toContain('outcome.status !== "GENERATED"');
  });

  it("keeps the disposable opening phase artifact-free — it must never generate a file", () => {
    const openingStart = routeSource.indexOf("function createMetrixOpeningStream");
    const openingEnd = routeSource.indexOf("\n}\n", openingStart);
    const openingBody = routeSource.slice(openingStart, openingEnd);
    expect(openingBody).not.toContain("generateCollectionsArtifact");
    expect(openingBody).not.toContain("Artifact");
  });

  it("the artifact generation module never calls any external evidence tool (dataset truth stays internal)", () => {
    expect(artifactServiceSource).not.toContain("resolveLiveExternalEvidence");
    expect(artifactServiceSource).not.toContain("collectExternalEvidence");
    expect(artifactServiceSource).not.toContain("createWebResearchEvidenceTool");
  });

  it("the Agent's artifact tool delivers via the same DeliverableArtifactPayload shape route.ts already sends to clients — no second payload shape", () => {
    expect(artifactToolSource).toContain("buildDeliverableArtifactPayload(outcome.file)");
    expect(artifactToolSource).toContain("onArtifactGenerated(");
  });
});
