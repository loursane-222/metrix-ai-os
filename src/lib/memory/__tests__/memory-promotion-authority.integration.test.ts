import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryCandidateStatus,
  MemoryItemSource,
  MemoryItemStatus,
  MemoryItemType,
  MemorySubjectType,
} from "@prisma/client";
import { assertMemoryItemTransitionAuthorization } from "@/lib/core/memory-items/memory-item-transition-authorization";

const candidate = {
  id: "candidate-1",
  organizationId: "org-1",
  createdByUserId: null,
  reviewedByUserId: null,
  subjectType: MemorySubjectType.ORGANIZATION,
  subjectId: null,
  proposedType: MemoryItemType.FACT,
  proposedKey: "team_size",
  proposedValue: "14 kişi",
  source: MemoryItemSource.SYSTEM_INFERRED,
  confidence: 80,
  isAssumption: true,
  reason: "EOS learning",
  evidenceJson: null,
  metadata: {
    knowledgeAuthority: {
      producer: "EOS_LEARNING",
      epistemicType: "INFERENCE",
      truthBoundary: "MODEL_INFERRED",
      canonicalOwner: "MEMORY_CANDIDATE",
      promotionPolicy: "HUMAN_APPROVAL",
    },
  },
  sourceEventId: null,
  sourceMessageId: null,
  status: MemoryCandidateStatus.PENDING,
  reviewedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const tx = {
  memoryCandidate: {
    findFirst: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
};

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/core/memory-items/memory-item.repository", () => ({
  findByIdForOrganization: vi.fn(),
  listActiveByOrganization: vi.fn().mockResolvedValue([]),
  markSuperseded: vi.fn(),
  createApprovedItem: vi.fn().mockResolvedValue({ id: "memory-1", status: MemoryItemStatus.ACTIVE }),
}));

import {
  createApprovedItem,
  findByIdForOrganization,
  listActiveByOrganization,
  markSuperseded,
} from "@/lib/core/memory-items/memory-item.repository";
import { approveMemoryCandidateForOrganization } from "../memory-promotion.service";

describe("Candidate → Promotion → MemoryItem authority integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.memoryCandidate.updateMany.mockResolvedValue({ count: 1 });
    tx.memoryCandidate.findFirst
      .mockResolvedValueOnce(candidate)
      .mockResolvedValue({ ...candidate, status: MemoryCandidateStatus.APPROVED });
    vi.mocked(listActiveByOrganization).mockResolvedValue([]);
    vi.mocked(createApprovedItem).mockResolvedValue({ id: "memory-1", status: MemoryItemStatus.ACTIVE } as never);
    vi.mocked(findByIdForOrganization).mockResolvedValue(null);
    vi.mocked(markSuperseded).mockResolvedValue({ status: MemoryItemStatus.SUPERSEDED } as never);
  });

  it("retains candidate authority and writes MemoryItem authority after approval", async () => {
    const result = await approveMemoryCandidateForOrganization({
      organizationId: "org-1",
      candidateId: "candidate-1",
      approverUserId: "user-1",
    });

    expect(result).toMatchObject({ promoted: true, memoryItemId: "memory-1" });
    const [memoryInput, memoryAuthority] = vi.mocked(createApprovedItem).mock.calls[0];
    expect(memoryInput.metadata).toMatchObject({
      candidateAuthority: {
        knowledgeAuthority: {
          producer: "EOS_LEARNING",
          canonicalOwner: "MEMORY_CANDIDATE",
        },
      },
      knowledgeAuthority: {
        producer: "CANDIDATE_APPROVED",
        canonicalOwner: "MEMORY_ITEM",
      },
    });
    expect(memoryAuthority.canonicalOwner).toBe("MEMORY_ITEM");
  });

  it("dismisses an exact duplicate through an authorized transition", async () => {
    vi.mocked(listActiveByOrganization).mockResolvedValueOnce([{
      id: "memory-existing",
      type: MemoryItemType.FACT,
      key: "team_size",
      value: "14 kişi",
      status: MemoryItemStatus.ACTIVE,
      deletedAt: null,
    } as never]);
    tx.memoryCandidate.findFirst
      .mockReset()
      .mockResolvedValueOnce(candidate)
      .mockResolvedValue({ ...candidate, status: MemoryCandidateStatus.DISMISSED });

    const result = await approveMemoryCandidateForOrganization({
      organizationId: "org-1",
      candidateId: candidate.id,
      approverUserId: "user-1",
    });

    expect(result).toMatchObject({ promoted: false, reason: "DUPLICATE_ACTIVE_MEMORY" });
    expect(createApprovedItem).not.toHaveBeenCalled();
  });

  it("uses an authorized MemoryItem supersede transition before replacement creation", async () => {
    vi.mocked(listActiveByOrganization).mockResolvedValueOnce([{
      id: "memory-old",
      organizationId: "org-1",
      type: MemoryItemType.FACT,
      key: "team_size",
      value: "10 kişi",
      status: MemoryItemStatus.ACTIVE,
      deletedAt: null,
    } as never]);
    vi.mocked(findByIdForOrganization).mockResolvedValueOnce({
      id: "memory-old",
      organizationId: "org-1",
      type: MemoryItemType.FACT,
      key: "team_size",
      value: "10 kişi",
      status: MemoryItemStatus.ACTIVE,
      deletedAt: null,
    } as never);

    const result = await approveMemoryCandidateForOrganization({
      organizationId: "org-1",
      candidateId: candidate.id,
      approverUserId: "user-1",
      supersedesMemoryId: "memory-old",
    });

    expect(result.promoted).toBe(true);
    const authorization = vi.mocked(markSuperseded).mock.calls[0][0];
    expect(() => assertMemoryItemTransitionAuthorization(authorization, "SUPERSEDE")).not.toThrow();
    expect(authorization).toMatchObject({ targetId: "memory-old", actorUserId: "user-1" });
  });
});
