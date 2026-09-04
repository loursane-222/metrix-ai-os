import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

/**
 * Single Response Ownership + Turn Lifecycle / Latency operation. Live
 * evidence: "Şirketimin entegrasyonlarını aç." correctly opened the
 * Company/Integrations Workspace, but METRIX produced TWO separate,
 * contradicting narrations — a full, multi-sentence paragraph from the
 * "opening" call (a second, independent OpenAI request with zero awareness
 * of business navigation — createMetrixOpeningStream is given an empty
 * evidence context) that asked which integration was meant, followed
 * seconds later by the canonical answer (correctly informed by
 * NAVIGATION_RESOLVED evidence) confirming the surface was already open.
 *
 * Root cause was NOT client-side text duplication or a missing dedupe —
 * the client already correctly isolates "opening" phase chunks into a
 * transient RuntimeStatus, never the message bubble (see
 * MetrixChatTab.tsx's activeChunkPhaseRef handling). The real defect was
 * that the decision to run the opening call at all was made in the outer
 * POST function scope, which has no access to executiveNavigationInput (a
 * variable local to the canonicalResponsePromise IIFE) — so the opening
 * call always ran, blind to whether navigation had already resolved.
 */
describe("single response ownership — opening call is skipped when navigation is already resolved", () => {
  it("openingEnabled is gated on !executiveNavigationInput, computed in the SAME scope executiveNavigationInput lives in — not the outer POST function", () => {
    const idx = route.indexOf("const openingEnabled = responseReadiness.mode");
    expect(idx).toBeGreaterThan(-1);
    expect(route.slice(idx, idx + 200)).toContain("!executiveNavigationInput");
    // Must be inside the canonicalResponsePromise IIFE: appears AFTER
    // executiveNavigationInput's own declaration, not after the IIFE closes.
    const iifeStart = route.indexOf("const canonicalResponsePromise = (async ()");
    const executiveNavInputDecl = route.indexOf("let executiveNavigationInput =");
    expect(iifeStart).toBeGreaterThan(-1);
    expect(executiveNavInputDecl).toBeGreaterThan(iifeStart);
    expect(idx).toBeGreaterThan(executiveNavInputDecl);
  });

  it("preserves the two pre-existing openingEnabled conditions unchanged — general chat fast-path and non-progress readiness still skip opening exactly as before (Executive Brain / evidence-backed turns unaffected)", () => {
    const idx = route.indexOf("const openingEnabled = responseReadiness.mode");
    const condition = route.slice(idx, idx + 200);
    expect(condition).toContain('responseReadiness.mode === "progress"');
    expect(condition).toContain("!fastPathResult.matched");
  });

  it("there is exactly one Response construction for the canonical+opening stream — no second outer bridge that awaits a resolved Promise<Response> and re-reads its .body", () => {
    // The old bug-prone pattern: awaiting canonicalResponsePromise from a
    // second, outer stream and manually pumping its .body reader. If this
    // reappears, the single-lifecycle merge has regressed.
    expect(route).not.toContain("const canonicalResponse = await canonicalResponsePromise;");
    expect(route).not.toContain("canonicalResponse.body.getReader()");
    // The IIFE's own IIFE-local content stream is bridged directly instead.
    expect(route).toContain("const reader = readableStream.getReader();");
  });

  it("canonicalResponsePromise is only ever awaited once, at the very end of POST, and returned directly — proving one authoritative response lifecycle per turn", () => {
    const occurrences = (route.match(/canonicalResponsePromise/g) ?? []).length;
    // Declaration + the one final await/return — no other reads of it.
    expect(occurrences).toBe(2);
    expect(route).toContain("return await canonicalResponsePromise;");
  });
});

describe("navigation fast path — command readiness does not wait on Executive Brain reasoning", () => {
  it("navigation_command_ready is logged immediately after executiveNavigationInput resolves, before the gateway/model call starts", () => {
    const readyIdx = route.indexOf('"navigation_command_ready"');
    const gatewayIdx = route.indexOf('"gateway_call_start"');
    expect(readyIdx).toBeGreaterThan(-1);
    expect(gatewayIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeLessThan(gatewayIdx);
  });

  it("business_navigation_resolved is logged as its own turn-lifecycle checkpoint, on the same requestId-scoped facility as every other stage — no second telemetry platform", () => {
    expect(route).toContain('logChatLatency(requestId, requestStartAt, "business_navigation_resolved"');
  });
});

describe("turn-level latency trace — no new telemetry platform, only the existing logChatLatency facility", () => {
  it.each([
    "request_received",
    "auth_done",
    "classification_start",
    "classification_done",
    "business_navigation_resolved",
    "navigation_command_ready",
    "provider_request_start",
    "first_upstream_chunk",
    "upstream_stream_complete",
    "opening_first_chunk",
    "opening_done",
    "response_done",
    "persistence_completion",
  ])("%s checkpoint exists on the shared logChatLatency(requestId, requestStartAt, ...) facility", (checkpoint) => {
    expect(route).toContain(`"${checkpoint}"`);
  });
});
