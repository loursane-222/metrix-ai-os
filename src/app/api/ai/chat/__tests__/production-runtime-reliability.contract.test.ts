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
