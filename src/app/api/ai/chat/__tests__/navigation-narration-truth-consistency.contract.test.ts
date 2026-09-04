import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

/**
 * Navigation Execution ↔ Narration Truth Consistency fix. Live evidence:
 * "Şirketimin entegrasyonlarını aç." correctly opened the Company/
 * Integrations Workspace while METRIX simultaneously narrated as though no
 * navigation had happened — company.root produced no operation evidence at
 * all, so Executive Brain reasoned about the raw message with zero signal
 * that navigation was already deterministically resolved and dispatched
 * this turn. Fixed at the shared evidence-projection seam
 * (business-navigation.ts's projectBusinessNavigationOperationEvidence),
 * not with a phrase-specific patch or a second narration path — these
 * assertions prove the fix is actually wired into route.ts's one canonical
 * prompt, not just defined.
 */
describe("navigation narration truth consistency route contract", () => {
  it("the canonical prompt carries a NAVIGATION_RESOLVED instruction fed by the same businessNavigationPresentationEvidence every other navigation operation already uses — no second evidence pipeline", () => {
    expect(route).toContain('businessNavigationPresentationEvidence?.operation === "NAVIGATION_RESOLVED"');
    // Same variable, same array, same ternary-chain pattern as the
    // pre-existing CUSTOMER_LOOKUP/CUSTOMER_LIST/DOMAIN_LIST/
    // MUTATION_SURFACE_RESOLVED instructions right above it — proves this
    // is one shared truth path, not a parallel one.
    const evidenceBlockStart = route.indexOf("businessNavigationPresentationEvidence && businessNavigationPresentationEvidence.operation !== \"DOMAIN_LIST\"");
    const navigationResolvedIdx = route.indexOf('businessNavigationPresentationEvidence?.operation === "NAVIGATION_RESOLVED"');
    const mutationSurfaceIdx = route.indexOf('businessNavigationPresentationEvidence?.operation === "MUTATION_SURFACE_RESOLVED"');
    expect(evidenceBlockStart).toBeGreaterThan(-1);
    expect(navigationResolvedIdx).toBeGreaterThan(mutationSurfaceIdx);
  });

  it("instructs the model never to ask which item/section/provider was meant and never to claim insufficient information for an already-resolved navigation", () => {
    const idx = route.indexOf('businessNavigationPresentationEvidence?.operation === "NAVIGATION_RESOLVED"');
    const instruction = route.slice(idx, idx + 1400);
    expect(instruction).toMatch(/never ask which specific item/i);
    expect(instruction).toMatch(/never say the request was unclear or insufficient/i);
    expect(instruction).toMatch(/never say you lack the information or authority/i);
  });

  it("does not let this instruction claim a further action (e.g. connecting/creating) was completed beyond opening the surface", () => {
    const idx = route.indexOf('businessNavigationPresentationEvidence?.operation === "NAVIGATION_RESOLVED"');
    const instruction = route.slice(idx, idx + 1400);
    expect(instruction).toMatch(/do not claim that further action itself was completed/i);
  });

  it("NAVIGATION_RESOLVED is deliberately excluded from the precomputed-deterministic-message whitelist — narration wording stays personality-owned, not hard-coded", () => {
    const whitelistBlock = route.slice(route.indexOf("const precomputedBusinessNavigationMessage ="), route.indexOf("const precomputedBusinessNavigationMessage =") + 500);
    expect(whitelistBlock).not.toContain("NAVIGATION_RESOLVED");
  });
});
