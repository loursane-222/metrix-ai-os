// Headless Executive Agent invocation for Stage 2 (Grand Consolidation
// §5.3-5.4). These tests cover only the deterministic wiring around the
// model call (cost short-circuit, output validation against real evidence)
// — not judgment content, which is the model's own call and not something
// a unit test can or should assert on.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runMock, agentCtorMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  agentCtorMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  Agent: class {
    constructor(config: unknown) {
      agentCtorMock(config);
    }
  },
  run: runMock,
}));

import { runAwarenessJudgment } from "../awareness-judgment";

const evidence = [
  { organizationId: "org-1", fingerprint: "fp-a", domain: "CASH_FLOW_RISK" as const, severityHint: "CRITICAL" as const, headline: "h", detail: null, observedAt: "2026-09-09T00:00:00Z", source: "executive-alerts" as const },
];

describe("runAwarenessJudgment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never calls the Executive Agent when there is no evidence (cost discipline)", async () => {
    const result = await runAwarenessJudgment({ organizationId: "org-1", organizationName: "Org", companyNarrative: null, evidence: [] });

    expect(result).toEqual([]);
    expect(agentCtorMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("passes evidence through and returns the Agent's structured judgments unchanged when fingerprints are real", async () => {
    runMock.mockResolvedValue({
      finalOutput: {
        judgments: [{
          correlationTitle: "t", evidenceFingerprints: ["fp-a"], disposition: "INTERVENE", significance: "HIGH",
          confidence: 0.7, reason: "r", insight: "i", recommendedNextMove: null, urgency: "HIGH", category: "FINANS", deliveryEligible: true,
        }],
      },
    });

    const result = await runAwarenessJudgment({ organizationId: "org-1", organizationName: "Org", companyNarrative: "narrative", evidence });

    expect(result).toHaveLength(1);
    expect(result[0].evidenceFingerprints).toEqual(["fp-a"]);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("drops a judgment whose evidence fingerprints don't match any real evidence (hallucination guard)", async () => {
    runMock.mockResolvedValue({
      finalOutput: {
        judgments: [{
          correlationTitle: "t", evidenceFingerprints: ["fp-does-not-exist"], disposition: "INTERVENE", significance: "HIGH",
          confidence: 0.7, reason: "r", insight: "i", recommendedNextMove: null, urgency: "HIGH", category: "FINANS", deliveryEligible: true,
        }],
      },
    });

    const result = await runAwarenessJudgment({ organizationId: "org-1", organizationName: "Org", companyNarrative: null, evidence });

    expect(result).toEqual([]);
  });

  it("returns an empty array when the Agent judges nothing worth reporting (SILENT-by-omission is valid)", async () => {
    runMock.mockResolvedValue({ finalOutput: { judgments: [] } });

    const result = await runAwarenessJudgment({ organizationId: "org-1", organizationName: "Org", companyNarrative: null, evidence });

    expect(result).toEqual([]);
  });
});
