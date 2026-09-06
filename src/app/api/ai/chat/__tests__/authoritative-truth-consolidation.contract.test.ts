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

/**
 * Customer Mutation Ownership Closure: proven live (requestId 8f5b5baa) that
 * a customer-edit-surface set_field command (draft-only — no database write;
 * see customer-edit-conversation-extension.ts) got narrated as "Telefon
 * bilgisini güncelledim." via buildCustomerEditHandoffMessage, entirely
 * bypassing the Executive Agent AND any authoritative readback — an
 * independent fresh-page-load readback proved the DB value never changed.
 * Fix: the CUSTOMER_EDIT_EXECUTED branch (reached by every non-commit
 * command) must gate its "güncelledim" (persisted) wording on
 * handoff.mutationPerformed, which customer-edit-conversation-extension.ts
 * now sets to true only for a real "commit".
 */
describe("chat route — customer-edit draft narration never claims persistence without mutationPerformed", () => {
  it("the CUSTOMER_EDIT_EXECUTED branch checks handoff.mutationPerformed before saying 'güncelledim'", () => {
    const start = routeSource.indexOf('handoff.outcomeCode === "CUSTOMER_EDIT_EXECUTED"');
    expect(start).toBeGreaterThan(-1);
    const end = routeSource.indexOf("}\n", routeSource.indexOf("bilgisini güncelledim", start));
    const block = routeSource.slice(start, end);
    expect(block).toContain("handoff.mutationPerformed");
    expect(block).toContain("taslağa işledim");
  });
});
