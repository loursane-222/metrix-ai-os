import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryCandidateStatus,
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
} from "@prisma/client";
import { assertMemoryCandidateTransitionAuthorization } from "@/lib/core/memory-candidates/memory-candidate-transition-authorization";

const explicitCandidate = {
  id: "candidate-onboarding",
  organizationId: "org-1",
  createdByUserId: "user-1",
  subjectType: MemorySubjectType.ORGANIZATION,
  subjectId: null,
  proposedType: MemoryItemType.FACT,
  proposedKey: "industry",
  proposedValue: "Üretim",
  source: MemoryItemSource.ONBOARDING,
  confidence: 95,
  isAssumption: false,
  status: MemoryCandidateStatus.PENDING,
  sourceEventId: null,
};

const candidateServiceMocks = vi.hoisted(() => ({
  createMemoryCandidate: vi.fn(),
  listPendingMemoryCandidatesByOrganization: vi.fn(),
}));
const candidateRepositoryMocks = vi.hoisted(() => ({ markApproved: vi.fn() }));
const memoryRepositoryMocks = vi.hoisted(() => ({ createApprovedItem: vi.fn() }));

vi.mock("@/lib/core/memory-candidates/memory-candidate.service", () => candidateServiceMocks);
vi.mock("@/lib/core/memory-candidates/memory-candidate.repository", () => candidateRepositoryMocks);
vi.mock("@/lib/core/memory-items/memory-item.repository", () => memoryRepositoryMocks);
vi.mock("@/lib/core/memory-items/memory-item.service", () => ({
  listActiveMemoryItemsByOrganization: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));

import { activateOnboardingMemoryCandidates } from "../candidate-engine.service";

describe("onboarding activation transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    candidateRepositoryMocks.markApproved.mockResolvedValue({
      ...explicitCandidate,
      status: MemoryCandidateStatus.APPROVED,
    });
    memoryRepositoryMocks.createApprovedItem.mockResolvedValue({ id: "memory-1" });
  });

  it("atomically approves an explicit answer and creates an authorized MemoryItem", async () => {
    candidateServiceMocks.listPendingMemoryCandidatesByOrganization.mockResolvedValue([explicitCandidate]);

    await expect(activateOnboardingMemoryCandidates({
      organizationId: "org-1",
      systemUserId: "user-1",
    })).resolves.toEqual({ activatedCount: 1, skippedCount: 0 });

    const transitionAuthorization = candidateRepositoryMocks.markApproved.mock.calls[0][0];
    expect(() => assertMemoryCandidateTransitionAuthorization(
      transitionAuthorization,
      "APPROVE",
    )).not.toThrow();
    expect(memoryRepositoryMocks.createApprovedItem.mock.calls[0][1]).toMatchObject({
      canonicalOwner: "MEMORY_ITEM",
      signal: { producer: "ONBOARDING" },
    });
  });

  it("does not auto-approve a SYSTEM_INFERRED assumption", async () => {
    candidateServiceMocks.listPendingMemoryCandidatesByOrganization.mockResolvedValue([{
      ...explicitCandidate,
      id: "candidate-inferred",
      source: MemoryItemSource.SYSTEM_INFERRED,
      isAssumption: true,
    }]);

    await expect(activateOnboardingMemoryCandidates({ organizationId: "org-1" }))
      .resolves.toEqual({ activatedCount: 0, skippedCount: 1 });
    expect(candidateRepositoryMocks.markApproved).not.toHaveBeenCalled();
    expect(memoryRepositoryMocks.createApprovedItem).not.toHaveBeenCalled();
  });
});
