import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");
const contextBuilder = readFileSync(resolve(process.cwd(), "src/lib/executive-brain/executive-brain-context-builder.service.ts"), "utf8");
const stages = [
  "executive_management_picture",
  "executive_brain_context_domain_evidence",
  "executive_assessment",
] as const;

describe("Executive Brain component telemetry contract", () => {
  it("uses the existing request profiler and production timeline for every component", () => {
    for (const stage of stages) {
      expect(`${route}\n${contextBuilder}`).toContain(stage);
    }
    for (const stage of stages.filter((value) =>
      !value.startsWith("executive_brain_context_")
      && value !== "executive_management_picture"
      && value !== "executive_assessment")) {
      expect(route).toContain(`markStart("${stage}")`);
      expect(route).toContain(`markEnd("${stage}")`);
    }
    expect(route).toContain("logChatLatency(requestId, requestStartAt");
    expect(route).toContain("conversationId: conversation.id");
    expect(route).toContain("organizationId");
  });

  // Grand Consolidation Operation: Council / Strategic Profile / Decision
  // Package / GM Brief (the org-wide standing "shadow" chain) are retired
  // entirely — buildExecutiveBrainShadowMetadata no longer calls any of
  // them, from any code path (see progressive-enrichment.contract.test.ts's
  // own retirement guard). Picture and Assessment remain real, deterministic
  // calibration stages that still run before Directive.
  it("moves Picture and Assessment before Directive, and never reaches the retired shadow chain", () => {
    const picture = route.indexOf("await buildExecutiveManagementPictureV1");
    const assessment = route.indexOf("buildExecutiveAssessmentFromManagementPicture", picture);
    const directive = route.indexOf("resolveExecutiveDirective({", assessment);
    expect(picture).toBeGreaterThan(0);
    expect([picture, assessment, directive]).toEqual([picture, assessment, directive].sort((a, b) => a - b));
    expect(route).not.toContain("council = buildExecutiveCouncil");
    expect(route).not.toContain("strategicProfile = buildStrategicProfile");
    expect(route).not.toContain("decisionPackage = buildExecutiveDecisionPackage");
    expect(route).not.toContain("brief = buildAIGeneralManagerBrief");
  });

  it("does not add a profiler, logger, prompt, gateway, or response path", () => {
    expect(route.match(/createRequestProfiler\("chat"\)/g)).toHaveLength(1);
    expect(contextBuilder).not.toContain("console.");
    expect(contextBuilder).not.toContain("generateResponse");
  });

  it("does not run post-stream executive opinions when Picture is not ready", () => {
    expect(route).toContain(
      "requiresExecutiveReasoning\n          && executiveManagementPicture.readiness.assessmentReady",
    );
  });
});
