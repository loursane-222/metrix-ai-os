import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryItemSource,
  MemoryItemType,
  MemorySubjectType,
} from "@prisma/client";

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));
vi.mock("../memory-item.repository", () => ({
  listActiveByOrganization: vi.fn(),
  findByIdForOrganization: vi.fn().mockResolvedValue({
    id: "memory-old", organizationId: "org-1", subjectType: "ORGANIZATION",
    subjectId: null, type: "FACT", key: "team_size", value: "10 kişi",
    source: "USER_PROVIDED", confidence: 100, status: "ACTIVE",
    isUserConfirmed: true, sourceEventId: null, sourceCandidateId: null,
    supersedesMemoryId: null, metadata: null, deletedAt: null,
  }),
  createApprovedItem: vi.fn().mockResolvedValue({ id: "memory-new", value: "12 kişi" }),
  markDeleted: vi.fn(),
  markSuperseded: vi.fn().mockResolvedValue({ id: "memory-old", status: "SUPERSEDED" }),
}));

import { createApprovedItem, markSuperseded } from "../memory-item.repository";
import {
  createApprovedMemoryItem,
  updateMemoryItemForOrganization,
} from "../memory-item.service";

describe("MemoryItem authority boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects direct model-inferred MemoryItem creation", async () => {
    await expect(createApprovedMemoryItem({
      organizationId: "org-1",
      subjectType: MemorySubjectType.ORGANIZATION,
      type: MemoryItemType.FACT,
      key: "employee_character",
      value: "Riskli olabilir",
      source: MemoryItemSource.SYSTEM_INFERRED,
    })).rejects.toThrow("Knowledge Authority rejected direct MemoryItem ownership");
    expect(createApprovedItem).not.toHaveBeenCalled();
  });

  it("user correction supersedes old memory and persists authority metadata", async () => {
    const result = await updateMemoryItemForOrganization({
      id: "memory-old",
      organizationId: "org-1",
      updatedByUserId: "user-1",
      value: "12 kişi",
    });

    expect(result?.id).toBe("memory-new");
    expect(markSuperseded).toHaveBeenCalledWith(expect.objectContaining({
      transition: "SUPERSEDE",
      organizationId: "org-1",
      targetId: "memory-old",
      actorUserId: "user-1",
    }), expect.anything());
    const [input, authorityDecision] = vi.mocked(createApprovedItem).mock.calls[0];
    expect(input).toMatchObject({
      source: MemoryItemSource.USER_CORRECTION,
      supersedesMemoryId: "memory-old",
      metadata: {
        knowledgeAuthority: {
          producer: "USER_CORRECTION",
          truthBoundary: "USER_CONFIRMED",
          canonicalOwner: "MEMORY_ITEM",
        },
      },
    });
    expect(authorityDecision.canonicalOwner).toBe("MEMORY_ITEM");
  });
});
