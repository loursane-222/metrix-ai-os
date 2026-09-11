import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

/**
 * Company Integrations Navigation Determinism Fix. Mirrors
 * management-turn-determinism.contract.test.ts's own ordering-proof pattern
 * (that file's "resolves management intent before provider classification"
 * test) for the same reason: whether the Company/Integrations Workspace
 * opens must never depend on classifyConversation's real LLM call
 * succeeding — a prompt-only fix already shipped once (commit 705a9d5) and
 * did not survive production. This proves the deterministic recognizer is
 * actually wired ahead of the provider call, not just defined.
 */
describe("company surface navigation determinism route contract", () => {
  it("resolves COMPANY_SURFACE_NAVIGATION deterministically before the classifyPromise ternary is even constructed", () => {
    // Direct Executive Hot-Path Migration: classifyConversation no longer
    // runs on the canonical path at all (the real LLM call this ordering
    // guard originally protected against is gone, not merely raced),
    // so the ordering proof now targets the classifyPromise construction
    // itself — recognizeCompanySurfaceNavigation must still run first.
    expect(route.indexOf("recognizeCompanySurfaceNavigation(message)")).toBeLessThan(route.indexOf("const classifyPromise ="));
    expect(route).toContain("buildCompanySurfaceNavigationUnderstanding(deterministicCompanySurfaceNavigation)");
    expect(route).not.toContain("classifyConversation({ message, recentMessages })");
  });

  it("the classification-history fetch this optimization used to skip is retired entirely, not conditionally skipped", () => {
    // The old classificationRecentMessagesPromise (and its deterministic-
    // match skip condition) no longer exists — there is no classification-
    // purpose history read left to skip, on any path.
    expect(route).not.toContain("!deterministicManagementIntent && !deterministicCompanySurfaceNavigation && !fastPathResult.matched && conversationId");
    expect(route).not.toContain("const classificationRecentMessagesPromise =");
  });

  it("the deterministic match takes priority over the general-chat fast path and readiness shortcuts in the same ternary chain", () => {
    const classifyPromiseBlock = route.slice(route.indexOf("const classifyPromise ="), route.indexOf("const classifyPromise =") + 600);
    const managementIdx = classifyPromiseBlock.indexOf("deterministicManagementIntent");
    const companyIdx = classifyPromiseBlock.indexOf("deterministicCompanySurfaceNavigation");
    const fastPathIdx = classifyPromiseBlock.indexOf("fastPathResult.matched");
    expect(managementIdx).toBeGreaterThan(-1);
    expect(companyIdx).toBeGreaterThan(managementIdx);
    expect(fastPathIdx).toBeGreaterThan(companyIdx);
  });
});
