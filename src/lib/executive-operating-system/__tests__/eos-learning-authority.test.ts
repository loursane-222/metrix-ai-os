import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  authorizeEosLearning,
  persistAuthorizedEosLearning,
} from "../eos-learning-authority.service";
import { createMissingMemoryCandidates } from "@/lib/memory/candidate-engine.service";

vi.mock("@/lib/memory/candidate-engine.service", () => ({
  createMissingMemoryCandidates: vi.fn().mockResolvedValue({ created: [], skipped: [] }),
}));

describe("EOS Learning Authority integration", () => {
  it("does not turn model learning into MemoryItem", () => {
    const [decision] = authorizeEosLearning({
      shouldLearn: true,
      blockedReason: null,
      candidates: [{
        key: "collection_risk",
        proposedValue: "Risk yükseliyor",
        rationale: "Muhakeme sinyali",
        trigger: "pattern_detected",
        signalStrength: "strong",
      }],
    });

    expect(decision.canonicalOwner).toBe("MEMORY_CANDIDATE");
    expect(decision.promotionPolicy).toBe("HUMAN_APPROVAL");
  });

  it("human approval learning decision is persisted as Candidate with complete authority metadata input", async () => {
    await persistAuthorizedEosLearning({
      organizationId: "org-1",
      learning: {
        shouldLearn: true,
        blockedReason: null,
        candidates: [{
          key: "collection_risk",
          proposedValue: "Risk yükseliyor",
          rationale: "Muhakeme sinyali",
          trigger: "pattern_detected",
          signalStrength: "strong",
        }],
      },
    });

    const input = vi.mocked(createMissingMemoryCandidates).mock.calls[0][0];
    const candidate = input.candidates[0];
    expect(candidate.authorityDecision).toMatchObject({
      epistemicType: "INFERENCE",
      truthBoundary: "MODEL_INFERRED",
      canonicalOwner: "MEMORY_CANDIDATE",
      promotionPolicy: "HUMAN_APPROVAL",
      signal: { producer: "EOS_LEARNING" },
    });
    expect(candidate.source).toBe("SYSTEM_INFERRED");
    expect(candidate.isAssumption).toBe(true);
  });
});
