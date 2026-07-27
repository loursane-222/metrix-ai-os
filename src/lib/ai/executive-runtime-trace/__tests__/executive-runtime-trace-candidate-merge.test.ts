import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { mergeCandidateSummary } from "../executive-runtime-trace-persistence.service";

describe("runtime trace candidate summary merge", () => {
  it("preserves every proposition while updating one candidate after promotion", () => {
    const result = mergeCandidateSummary({
      propositionIds: ["candidate-1", "candidate-2"],
      changeIds: ["change-1", "change-2"],
      approvalStates: [
        { candidateId: "candidate-1", status: "PENDING_APPROVAL" },
        { candidateId: "candidate-2", status: "PENDING_APPROVAL" },
      ],
      promotions: [],
      blockedAiGeneratedCount: 1,
    }, {
      propositionIds: ["candidate-2"],
      changeIds: ["change-2"],
      approvalStates: [{ candidateId: "candidate-2", status: "PROMOTED" }],
      promotions: [{ candidateId: "candidate-2", executionId: "execution-2" }],
      blockedAiGeneratedCount: 0,
    });

    expect(result).toEqual({
      propositionIds: ["candidate-1", "candidate-2"],
      changeIds: ["change-1", "change-2"],
      approvalStates: [
        { candidateId: "candidate-1", status: "PENDING_APPROVAL" },
        { candidateId: "candidate-2", status: "PROMOTED" },
      ],
      promotions: [{ candidateId: "candidate-2", executionId: "execution-2" }],
      blockedAiGeneratedCount: 1,
    });
  });
});
