import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
const vercelJsonSource = readFileSync(new URL("../../../../../../vercel.json", import.meta.url), "utf8");
const modelConfigSource = readFileSync(new URL("../../../../../lib/ai/model-config.ts", import.meta.url), "utf8");

/**
 * Executive Agent Production Runtime Reliability Closure: the production
 * timeout ("Task timed out after 60 seconds") was a deployment-configuration
 * ceiling, not an architecture defect — these guards protect the fix
 * (verified plan/Fluid Compute duration + honest failure messaging) from
 * silently regressing back to the old 60s ceiling or a silent empty
 * response, without re-litigating the architecture itself.
 */
describe("chat route — production runtime reliability", () => {
  it("declares the verified 300s duration ceiling, not the old 60s default", () => {
    expect(routeSource).toMatch(/export const maxDuration = 300;/);
    expect(routeSource).not.toMatch(/export const maxDuration = 60;/);
  });

  it("the project declares Fluid Compute, which is what makes 300s valid on this plan", () => {
    const parsed = JSON.parse(vercelJsonSource) as Record<string, unknown>;
    expect(parsed.fluid).toBe(true);
  });

  it("the Agent's own internal run timeout stays safely below the route's maxDuration", () => {
    const maxDurationMatch = routeSource.match(/export const maxDuration = (\d+);/);
    const runTimeoutMatch = modelConfigSource.match(/METRIX_EXECUTIVE_RUN_TIMEOUT_MS \?\? (\d+)/);
    expect(maxDurationMatch).not.toBeNull();
    expect(runTimeoutMatch).not.toBeNull();
    const maxDurationMs = Number(maxDurationMatch![1]) * 1000;
    const runTimeoutMs = Number(runTimeoutMatch![1]);
    expect(runTimeoutMs).toBeLessThan(maxDurationMs);
    // Require real margin (at least 10s) for response finalization/persistence
    // after an abort — not just numerically less.
    expect(maxDurationMs - runTimeoutMs).toBeGreaterThanOrEqual(10_000);
  });

  it("a run that does not complete surfaces one honest, non-empty message live in the stream AND in the persisted record — never a silent empty response", () => {
    expect(routeSource).toMatch(/const EXECUTIVE_AGENT_TIMEOUT_MESSAGE = ".+";/);
    // Live SSE stream: enqueued as soon as the run is known not to have completed.
    const failedBlockStart = routeSource.indexOf('console.error("executive_agent_run_failed"');
    const failedBlockEnd = routeSource.indexOf("\n            }", failedBlockStart);
    const failedBlock = routeSource.slice(failedBlockStart, failedBlockEnd);
    expect(failedBlock).toContain("EXECUTIVE_AGENT_TIMEOUT_MESSAGE");
    // Persisted content: same constant, not a re-typed duplicate string.
    expect(routeSource).toContain(
      ': EXECUTIVE_AGENT_TIMEOUT_MESSAGE)\n            : await buildAiContent({',
    );
  });

  it("the approval flow is instructed to stop and report immediately on AWAITING_APPROVAL, not keep reasoning", () => {
    const constitutionSource = readFileSync(
      new URL("../../../../../lib/executive-agent/constitution.ts", import.meta.url),
      "utf8",
    );
    expect(constitutionSource).toContain("AWAITING_APPROVAL");
    expect(constitutionSource).toMatch(/AWAITING_APPROVAL.*işlem orada biter/);
  });

  it("still exactly one Executive Agent run per turn — the reliability fix did not introduce a second runtime or a fallback brain", () => {
    expect((routeSource.match(/await runExecutiveAgent\(/g) ?? []).length).toBe(1);
  });
});

/**
 * Stage 1 Production Reliability Closure — chat lockup class (requestId
 * 1c2a0470: a request stuck at `await classifyPromise` for ~300s, no
 * classification_done, no executive_agent_* event, no done_event_sent).
 * Original fix: a bounded, independent safety net around the classification
 * history read that fed classifyConversation.
 *
 * Direct Executive Hot-Path Migration retired the hang vector itself rather
 * than continuing to bound it: classifyConversation is no longer on the
 * canonical (non-fast-path) turn path, so classifyPromise's remaining
 * branches are all synchronous, already-resolved values — none of them
 * reads anything, so none of them can hang. These guards now protect that
 * stronger invariant instead of the old bounded-fallback mechanism.
 */
describe("chat route — classification can no longer hang the request (no read on the canonical path)", () => {
  it("classifyPromise's branches are all Promise.resolve of already-known values — no listRecentMessagesByConversation read to hang on", () => {
    const blockStart = routeSource.indexOf("const classifyPromise =");
    const blockEnd = routeSource.indexOf(";\n", blockStart);
    const block = routeSource.slice(blockStart, blockEnd);
    expect(block).toContain("DIRECT_EXECUTIVE_UNDERSTANDING");
    expect(block).not.toContain("listRecentMessagesByConversation(");
    expect(block).not.toContain("await ");
  });

  it("the old bounded-fallback classification-history mechanism is fully retired, not left as dead scaffolding", () => {
    expect(routeSource).not.toContain('import { withBoundedFallback } from "@/lib/api/bounded-fallback"');
    expect(routeSource).not.toContain("classificationRecentMessagesPromise");
    expect(routeSource).not.toMatch(/CLASSIFICATION_HISTORY_FETCH_TIMEOUT_MS/);
  });
});

describe("shared Prisma layer — concurrency-safety regression guard", () => {
  const prismaSource = readFileSync(new URL("../../../../../lib/core/shared/prisma.ts", import.meta.url), "utf8");

  it("constructs the pg driver adapter from a connection config, never a raw single pg.Client — PrismaPg's own connect() creates a real pg.Pool from that config, giving every query its own checked-out connection", () => {
    expect(prismaSource).toContain("new PrismaPg({ connectionString })");
    expect(prismaSource).not.toMatch(/new\s+(?:pg\.)?Client\s*\(/);
  });

  it("never caps the underlying pool at a single connection — that would recreate the exact single-connection hazard this closure is guarding against", () => {
    expect(prismaSource).not.toMatch(/max\s*:\s*1\b/);
  });
});

describe("Executive Agent tool concurrency — stays serialized (Stage 1 Production Reliability Closure)", () => {
  const runtimeSource = readFileSync(new URL("../../../../../lib/executive-agent/runtime.ts", import.meta.url), "utf8");

  it("toolExecution.maxFunctionToolConcurrency stays at 1 — do not silently re-open parallel tool execution before the data layer's own concurrency safety is independently proven", () => {
    expect(runtimeSource).toMatch(/toolExecution:\s*\{\s*maxFunctionToolConcurrency:\s*1\s*\}/);
  });
});

/**
 * A canonical canonical-continuation/approval or CONTEXT_BOUND_WORKSPACE_COMMAND
 * handoff (e.g. the customer-edit extension's own
 * CUSTOMER_EDIT_CLARIFICATION_REQUIRED for "Bu müşterinin telefonunu
 * değiştir.") is already a complete, authoritative answer for the turn —
 * the Executive Agent must never also run for it. This is what makes
 * "gereksiz tool başlamıyor" true structurally: if the Agent never starts,
 * executive_agent_tool_start can never fire, regardless of what the
 * classification call (now bounded above) does.
 */
describe("chat route — a precomputed deterministic handoff skips the Executive Agent entirely", () => {
  it("executiveAgentWillRespond is gated on !hasPrecomputedDeterministicOverride", () => {
    const willRespondBlockStart = routeSource.indexOf("const executiveAgentWillRespond =");
    const willRespondBlockEnd = routeSource.indexOf(";\n", willRespondBlockStart);
    expect(routeSource.slice(willRespondBlockStart, willRespondBlockEnd)).toContain("!hasPrecomputedDeterministicOverride");
  });

  it("a real conversation-extension handoff (precomputedDeterministicHandoffMessage) is one of the conditions that sets hasPrecomputedDeterministicOverride", () => {
    const overrideBlockStart = routeSource.indexOf("const hasPrecomputedDeterministicOverride = Boolean(");
    const overrideBlockEnd = routeSource.indexOf(");\n", overrideBlockStart);
    expect(routeSource.slice(overrideBlockStart, overrideBlockEnd)).toContain("precomputedDeterministicHandoffMessage");
  });
});
