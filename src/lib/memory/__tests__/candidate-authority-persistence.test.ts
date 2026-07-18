import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryItemSource, MemoryItemType, MemorySubjectType } from "@prisma/client";

vi.mock("@/lib/core/memory-candidates/memory-candidate.service", () => ({
  createMemoryCandidate: vi.fn().mockResolvedValue({ id: "candidate-1" }),
  listPendingMemoryCandidatesByOrganization: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/core/memory-items/memory-item.service", () => ({
  listActiveMemoryItemsByOrganization: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/core/memory-items/memory-item.repository", () => ({
  createApprovedItem: vi.fn(),
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {},
}));

import { createMemoryCandidate } from "@/lib/core/memory-candidates/memory-candidate.service";
import { createMissingMemoryCandidates } from "../candidate-engine.service";

describe("Memory Candidate authority persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists all required authority fields in candidate metadata", async () => {
    await createMissingMemoryCandidates({
      organizationId: "org-1",
      candidates: [{
        subjectType: MemorySubjectType.ORGANIZATION,
        proposedType: MemoryItemType.STRATEGIC,
        proposedKey: "strategic_focus",
        proposedValue: "tahsilat",
        source: MemoryItemSource.SYSTEM_INFERRED,
        confidence: 0.7,
        isAssumption: true,
        reason: "Inference requires approval.",
      }],
    });

    const [candidate, authorityDecision] = vi.mocked(createMemoryCandidate).mock.calls[0];
    expect(candidate.metadata).toMatchObject({
      knowledgeAuthority: {
        producer: "RECOGNITION_RESULT",
        epistemicType: "ASSUMPTION",
        truthBoundary: "MODEL_INFERRED",
        canonicalOwner: "MEMORY_CANDIDATE",
        promotionPolicy: "HUMAN_APPROVAL",
      },
    });
    expect(authorityDecision.canonicalOwner).toBe("MEMORY_CANDIDATE");
  });
});
