import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");
const contextBuilder = readFileSync(resolve(process.cwd(), "src/lib/executive-brain/executive-brain-context-builder.service.ts"), "utf8");
const stages = [
  "executive_management_picture",
  "executive_brain_context_domain_evidence",
  "executive_assessment",
  "executive_council",
  "executive_strategic_profile",
  "executive_decision_package",
  "executive_gm_brief",
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
    expect(route).toContain("logChatLatency(input.requestId, input.requestStartAt");
    expect(route).toContain("conversationId: input.conversationId");
    expect(route).toContain("organizationId");
    expect(route).toContain("errorReason");
  });

  it("moves Picture and Assessment before Directive while enriching the active stream", () => {
    const done = route.indexOf('"done_event_sent"');
    const firstChunk = route.indexOf('controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk"');
    const progressiveCall = route.indexOf("startProgressiveIntelligence();", firstChunk);
    expect(progressiveCall).toBeGreaterThan(firstChunk);
    expect(progressiveCall).toBeLessThan(done);

    const picture = route.indexOf("await buildExecutiveManagementPictureV1");
    const assessment = route.indexOf("buildExecutiveAssessmentFromManagementPicture", picture);
    const directive = route.indexOf("resolveExecutiveDirective({", assessment);
    const council = route.indexOf("council = buildExecutiveCouncil", progressiveCall);
    const profile = route.indexOf("strategicProfile = buildStrategicProfile", council);
    const decision = route.indexOf("decisionPackage = buildExecutiveDecisionPackage", profile);
    const brief = route.indexOf("brief = buildAIGeneralManagerBrief", decision);
    expect(picture).toBeGreaterThan(0);
    expect([picture, assessment, directive]).toEqual([picture, assessment, directive].sort((a, b) => a - b));
    expect(council).toBeGreaterThan(progressiveCall);
    expect([council, profile, decision, brief]).toEqual([council, profile, decision, brief].sort((a, b) => a - b));
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
