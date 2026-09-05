import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const activeExtensionSource = readFileSync(new URL("../active-conversation-extension.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
const actionToolsSource = readFileSync(new URL("../../executive-agent/tools/action-tools.ts", import.meta.url), "utf8");

/**
 * Legacy Conversation Ownership & Dangling Stream Closure.
 *
 * Binding invariant: ONE USER INTENT -> ONE SEMANTIC OWNER -> ONE EXECUTION
 * OWNER -> ONE RESPONSE OWNER. orchestrationConversationExtension was an
 * independent semantic/cognition owner — its own free-text-to-plan LLM call
 * (resolveGeneralOrchestrationPlan via requestOrchestrationPlanAndRun),
 * competing with the METRIX Executive Agent for any natural-language
 * business-write utterance nothing more specific claimed — and proven
 * (2026-09-05, requestId 909f3ce6) to leave the underlying /api/ai/chat
 * invocation dangling until the platform force-killed it at maxDuration.
 * These guards protect its retirement without re-litigating the
 * architecture: the canonical execution capability (runOrchestration,
 * multi-step atomic plans with compensation) is preserved and toolified
 * under the Agent, not reimplemented.
 */
describe("legacy conversation ownership retirement", () => {
  it("orchestrationConversationExtension is no longer an active dispatch owner — natural-language business writes cannot be consumed by it", () => {
    expect(activeExtensionSource).not.toMatch(/^import\s*{\s*orchestrationConversationExtension\s*}/m);
    expect(activeExtensionSource).not.toMatch(/const extensions:[^;]*\borchestrationConversationExtension\b/);
  });

  it("keeps the deterministic pending-approval confirmation fast path — it does not interpret new business intent, only confirms an already-decided one", () => {
    expect(activeExtensionSource).toContain("orchestrationApprovalConversationExtension");
    expect(activeExtensionSource).toMatch(/const extensions:[^;]*\borchestrationApprovalConversationExtension\b/);
  });

  it("a weak/provisional legacy claim no longer counts as this turn's authoritative outcome — the turn still reaches the Executive Agent instead of dead-ending", () => {
    expect(routeSource).toContain("isProvisionalConversationHandoff");
    expect(routeSource).toContain(
      "const authoritativeConversationExtensionHandoff = (isNavigationBlindHandoff(conversationExtensionHandoff) || isProvisionalConversationHandoff(conversationExtensionHandoff)) ? null : conversationExtensionHandoff;",
    );
  });
});

describe("dangling stream closure — shared boundary", () => {
  it("skips real provider generation whenever any deterministic override will replace aiContent — the proven-hanging redundant call never runs", () => {
    expect(routeSource).toContain(
      "skipProviderGeneration: hasCompletedDeterministicManagementTurn || hasCompletedDeterministicCompanyQueryTurn || executiveAgentWillRespond || hasPrecomputedDeterministicOverride,",
    );
  });

  it("the suppression gate (executiveAgentWillRespond) and skipProviderGeneration read the same shared boolean, so they can never disagree", () => {
    const sharedBooleanCount = (routeSource.match(/hasPrecomputedDeterministicOverride/g) ?? []).length;
    // Declaration + executiveAgentWillRespond + skipProviderGeneration = 3 uses minimum.
    expect(sharedBooleanCount).toBeGreaterThanOrEqual(3);
  });
});

describe("canonical write architecture preserved — no reimplementation, no second execution path", () => {
  it("the Executive Agent's write tool still runs through the one canonical orchestration engine", () => {
    expect(actionToolsSource).toContain("runOrchestration(");
    expect(actionToolsSource).not.toMatch(/\bfetch\(/);
  });

  it("the Agent's write tool now accepts multi-step atomic plans, so retiring the legacy fallback does not lose compensation capability", () => {
    expect(actionToolsSource).toContain("stepsJson");
    expect(actionToolsSource).toContain("plan: { steps: steps.map(");
  });
});
