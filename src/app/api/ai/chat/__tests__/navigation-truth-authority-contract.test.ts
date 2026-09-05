import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

/**
 * Production regression: a domain-blind orchestration CLARIFICATION_REQUIRED
 * handoff ("I couldn't map this to a business action") was being treated as
 * this turn's authoritative, already-decided outcome — showing a premature
 * "Devam edebilmem için biraz daha bilgi verir misiniz?" AND vetoing
 * business-navigation's own resolution, so the narration went on to
 * describe a workspace reveal that never actually happened (see
 * isNavigationBlindHandoff's doc comment for the full root-cause trace).
 * Static source contract (route.ts has no request-level test harness) —
 * proves every point that used to trust the raw handoff for
 * navigation/clarification authority now goes through the one derived,
 * navigation-blind-aware variable instead.
 */
describe("chat route: navigation-blind handoffs never gate business-navigation or precompute clarification", () => {
  it("derives authoritativeConversationExtensionHandoff via isNavigationBlindHandoff", () => {
    expect(routeSource).toContain("isNavigationBlindHandoff");
    expect(routeSource).toContain("const authoritativeConversationExtensionHandoff = isNavigationBlindHandoff(conversationExtensionHandoff) ? null : conversationExtensionHandoff;");
  });

  it("precomputes the deterministic handoff message from the authoritative variable, not the raw handoff", () => {
    expect(routeSource).toContain("const precomputedDeterministicHandoffMessage = authoritativeConversationExtensionHandoff");
  });

  it("gates business-navigation's own dispatch on the authoritative variable, not the raw handoff", () => {
    expect(routeSource).toContain('businessNavigationResolution.status === "RESOLVED" && !authoritativeConversationExtensionHandoff');
  });

  it("gates bare-followup operation continuity on the authoritative variable, not the raw handoff", () => {
    expect(routeSource).toContain("!executiveNavigationInput && !authoritativeConversationExtensionHandoff");
  });

  it("injects the 'treat handoff as authoritative, never reinterpret' narration instruction from the authoritative variable, not the raw handoff", () => {
    expect(routeSource).toContain("authoritativeConversationExtensionHandoff\n        ? `Conversation-extension runtime evidence");
  });
});

/**
 * Follow-up guard on the same production regression: businessNavigationOperationEvidence
 * is projected straight from businessNavigationResolution and, unlike executiveNavigationInput,
 * was never aware that a REAL (non-navigation-blind) authoritative handoff had just vetoed
 * dispatch — so on that exact combination (business-navigation independently RESOLVED the
 * same utterance a different, already-authoritative handoff already owns) it kept asserting
 * a Living Workspace surface "was requested"/opened/shown, in both the deterministic
 * navigation message and the narration prompt evidence, racing the real handoff's own
 * outcome. businessNavigationDispatchVetoed/businessNavigationPresentationEvidence close this:
 * every presentation-claiming narration path must read the vetoed-aware variable, never the
 * raw evidence, while business-truth-only consumers (canonicalCustomerResolved,
 * isCustomerListTurn/isDomainListTurn, telemetry) keep reading the raw evidence unchanged.
 */
describe("chat route: navigation/presentation narration evidence never survives a real dispatch veto", () => {
  it("derives businessNavigationDispatchVetoed from the same RESOLVED + authoritative-handoff combination that vetoes executiveNavigationInput", () => {
    expect(routeSource).toContain('const businessNavigationDispatchVetoed = businessNavigationResolution.status === "RESOLVED" && Boolean(authoritativeConversationExtensionHandoff);');
    expect(routeSource).toContain("const businessNavigationPresentationEvidence = businessNavigationDispatchVetoed ? null : businessNavigationOperationEvidence;");
  });

  it("builds the deterministic navigation message from the vetoed-aware variable, not the raw evidence", () => {
    expect(routeSource).toContain("buildBusinessNavigationMessage(businessNavigationPresentationEvidence, calendarClock)");
  });

  it("builds every presentation-claiming narration evidence line from the vetoed-aware variable, not the raw evidence", () => {
    expect(routeSource).toContain('businessNavigationPresentationEvidence && businessNavigationPresentationEvidence.operation !== "DOMAIN_LIST"');
    expect(routeSource).toContain("buildPromptSafeNavigationEvidence(businessNavigationPresentationEvidence)");
    expect(routeSource).toContain('businessNavigationPresentationEvidence?.operation === "CUSTOMER_LIST"');
    expect(routeSource).toContain('businessNavigationPresentationEvidence?.operation === "DOMAIN_LIST"');
    expect(routeSource).toContain('businessNavigationPresentationEvidence?.operation === "CUSTOMER_LOOKUP" && businessNavigationPresentationEvidence.outcome === "RESOLVED"');
    expect(routeSource).toContain('businessNavigationPresentationEvidence?.operation === "MUTATION_SURFACE_RESOLVED"');
  });

  it("keeps business-truth-only consumers (customer really resolved, telemetry) reading the raw, non-vetoed evidence", () => {
    // isCustomerListTurn/isDomainListTurn were guards on pipeline C's second,
    // independent enrichment model call (retired by the Unified Executive
    // Turn Runtime consolidation — see progressive-enrichment removal); with
    // no second call left to guard, those variables no longer exist.
    expect(routeSource).toContain('canonicalCustomerResolved: businessNavigationOperationEvidence?.operation === "CUSTOMER_LOOKUP" && businessNavigationOperationEvidence.outcome === "RESOLVED"');
  });
});
