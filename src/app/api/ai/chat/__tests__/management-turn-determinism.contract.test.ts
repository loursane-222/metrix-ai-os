import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

describe("management turn determinism route contract", () => {
  it("resolves management intent before provider classification and never projects Payment navigation for it", () => {
    expect(route.indexOf("recognizeManagementIntent(message)")).toBeLessThan(route.indexOf("classifyConversation({ message, recentMessages })"));
    expect(route).toContain("buildManagementIntentUnderstanding(deterministicManagementIntent)");
    expect(route).toContain("const currentFactEntities = deterministicManagementIntent ? []");
    expect(route).toContain("const canonicalBusinessFacts = deterministicManagementIntent\n      ? []");
    expect(route).toContain("deterministicCollectionPerformanceMessage ?? deterministicCollectionComparisonMessage ?? deterministicCollectionDriversMessage ?? deterministicCollectionTargetMessage ?? precomputedDeterministicHandoffMessage");
  });

  it("completes a resolved collection-performance turn without answer-model work", () => {
    expect(route).toContain("const hasCompletedDeterministicCollectionPerformance = Boolean(");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicCollectionTurn");
    expect(route).toContain("onExecutiveConversationGuidanceObserved: (guidance) => {");
    expect(route).toContain("executiveRuntimeTrace.observeCanonicalPrompt(");
    expect(route).toContain("providerGenerationSkipped: hasCompletedDeterministicCollectionTurn");
    expect(route).toContain("? (deterministicCollectionPerformanceMessage ?? deterministicCollectionComparisonMessage ?? deterministicCollectionDriversMessage ?? deterministicCollectionTargetMessage)!");
  });

  it("completes drivers and target position through the traced no-provider path", () => {
    expect(route).toContain("projectCollectionDriversTurnFact(");
    expect(route).toContain("projectCollectionTargetTurnFact(");
    expect(route).toContain("hasCompletedDeterministicCollectionDrivers");
    expect(route).toContain("hasCompletedDeterministicCollectionTarget");
    expect(route).toContain("collectionDriversTurnFact ? buildCollectionDriversPromptLine(collectionDriversTurnFact) : null");
    expect(route).toContain("collectionTargetTurnFact ? buildCollectionTargetPromptLine(collectionTargetTurnFact) : null");
  });

  it("completes collection comparison through the same traced no-provider path", () => {
    expect(route).toContain("projectCollectionComparisonTurnFact(");
    expect(route).toContain("const hasCompletedDeterministicCollectionComparison = Boolean(");
    expect(route).toContain("const hasCompletedDeterministicCollectionTurn =");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicCollectionTurn");
    expect(route).toContain("collectionComparisonTurnFact ? buildCollectionComparisonPromptLine(collectionComparisonTurnFact) : null");
    expect(route).toContain("!hasCompletedDeterministicCollectionTurn && !workspaceCloseRequested");
    expect(route).toContain("executiveRuntimeTrace.observeCanonicalPrompt(");
    expect(route).toContain("onExecutiveConversationGuidanceObserved: (guidance) => {");
  });
});
