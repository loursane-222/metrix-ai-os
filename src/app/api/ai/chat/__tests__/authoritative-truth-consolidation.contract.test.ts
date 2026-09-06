import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

/**
 * Authoritative Truth Consolidation, part 2/3: proven live that a company-
 * relevant fact question about a concretely-open entity ("şu anki telefon
 * numarası nedir?" with a customer-detail Workspace open) could get answered
 * from the static executiveManagementPicture evidence alone — never invoking
 * the Executive Agent (and its real company_read -> customer.read authority)
 * at all — because conversationUnderstanding classified it shouldInvokeExecutiveBrain:
 * false / suggestedHandling: "answer_only". That static evidence
 * (customerEvidenceSummary) never claimed to cover arbitrary entity fields,
 * so the answer came out wrong (denying data that canonical read authority
 * actually has).
 *
 * Fix is a general routing invariant, not a phrase/field-specific patch: a
 * concrete open entity (activeWorkspaceContext.entityId) plus the
 * classifier's own "answer_only" + company-relevant verdict forces the
 * Executive Agent to take the turn instead of letting the static path own
 * it. These guards protect that invariant's presence and its generality
 * (no "phone"/"customer" string anywhere in the condition).
 */
describe("chat route — entity-anchored fact queries reach the Executive Agent, not just static evidence", () => {
  it("declares a hasEntityAnchoredFactQuery condition keyed on a concrete open entity + answer_only + company-relevant", () => {
    const start = routeSource.indexOf("const hasEntityAnchoredFactQuery =");
    expect(start).toBeGreaterThan(-1);
    const end = routeSource.indexOf(";\n", start);
    const block = routeSource.slice(start, end);
    expect(block).toContain("activeWorkspaceContext?.entityId");
    expect(block).toContain('conversationUnderstanding.suggestedHandling === "answer_only"');
    expect(block).toContain('conversationUnderstanding.companyRelevance !== "none"');
  });

  it("is field/domain-agnostic — no hardcoded phone/customer check drives it", () => {
    const start = routeSource.indexOf("const hasEntityAnchoredFactQuery =");
    const end = routeSource.indexOf(";\n", start);
    const block = routeSource.slice(start, end).toLowerCase();
    expect(block).not.toContain("phone");
    expect(block).not.toContain("telefon");
    expect(block).not.toContain("customer");
  });

  it("hasEntityAnchoredFactQuery is one of the conditions that sets executiveAgentWillRespond", () => {
    const start = routeSource.indexOf("const executiveAgentWillRespond =");
    expect(start).toBeGreaterThan(-1);
    const end = routeSource.indexOf(";\n", start);
    const block = routeSource.slice(start, end);
    expect(block).toContain("hasEntityAnchoredFactQuery");
    // Still gated behind the existing deterministic-override guard — a real
    // navigation/handoff/workspace-close/unconfirmed-mutation fast path
    // still wins, unchanged.
    expect(block).toContain("!hasPrecomputedDeterministicOverride");
  });
});
