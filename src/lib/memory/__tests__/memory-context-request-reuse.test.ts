import {
  MemoryItemSource,
  MemoryItemStatus,
  MemoryItemType,
  MemorySubjectType,
  type MemoryItem,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/memory-items/memory-item.service", () => ({
  listActiveMemoryItemsByOrganization: vi.fn(),
}));

import { buildMemoryContextFromItems } from "../memory-context-builder.service";

function item(input: {
  id: string;
  organizationId: string;
  key: string;
  value: string;
}): MemoryItem {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: input.id,
    organizationId: input.organizationId,
    createdByUserId: null,
    subjectType: MemorySubjectType.ORGANIZATION,
    subjectId: null,
    type: MemoryItemType.FACT,
    key: input.key,
    value: input.value,
    source: MemoryItemSource.USER_PROVIDED,
    confidence: 1,
    status: MemoryItemStatus.ACTIVE,
    isUserConfirmed: true,
    sourceEventId: null,
    sourceCandidateId: null,
    supersedesMemoryId: null,
    metadata: null,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("request-scoped memory context reuse", () => {
  it("builds from supplied rows without shared cross-request state", () => {
    const atlas = buildMemoryContextFromItems({
      organizationId: "org-atlas",
      activeItems: [
        item({
          id: "memory-atlas",
          organizationId: "org-atlas",
          key: "customer",
          value: "Atlas",
        }),
      ],
    });
    const other = buildMemoryContextFromItems({
      organizationId: "org-other",
      activeItems: [],
    });

    expect(atlas.organizationId).toBe("org-atlas");
    expect(atlas.facts[0]?.value).toBe("Atlas");
    expect(other.organizationId).toBe("org-other");
    expect(other.totalIncluded).toBe(0);
  });
});
