import { MemoryItemSource, MemoryItemType } from "@prisma/client";

import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";

import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type {
  BuildMemoryContextForOrganizationInput,
  MemoryContext,
  MemoryContextConflict,
  MemoryContextItem,
  MemoryContextItemType,
} from "./memory-context.types";

const MEMORY_CONTEXT_VERSION = "v1";
const DEFAULT_MAX_ITEMS = 20;
const MIN_MAX_ITEMS = 1;
const MAX_MAX_ITEMS = 50;
const MAX_VALUE_LENGTH = 500;
const HIGHLIGHTS_LIMIT = 5;

const TYPE_PRIORITY: Record<MemoryContextItemType, number> = {
  STRATEGIC: 0,
  FACT: 1,
  PROCESS: 2,
  PREFERENCE: 3,
};

const SOURCE_PRIORITY: Record<string, number> = {
  [MemoryItemSource.USER_CORRECTION]: 0,
  [MemoryItemSource.USER_PROVIDED]: 1,
  [MemoryItemSource.CANDIDATE_APPROVED]: 2,
  [MemoryItemSource.ONBOARDING]: 3,
  [MemoryItemSource.SYSTEM_INFERRED]: 4,
  [MemoryItemSource.EVENT_DERIVED]: 5,
};

export async function buildMemoryContextForOrganization(
  input: BuildMemoryContextForOrganizationInput,
): Promise<MemoryContext> {
  assertNonEmpty(input.organizationId, "organizationId");

  const maxItems = clampMaxItems(input.maxItems);
  const activeItems = await listActiveMemoryItemsByOrganization(
    input.organizationId,
  );
  const normalizedItems = activeItems
    .map(normalizeMemoryItem)
    .sort(compareMemoryContextItems)
    .slice(0, maxItems);
  const conflicts = buildConflicts(normalizedItems);
  const conflictItemIds = new Set(
    conflicts.flatMap((conflict) => conflict.items.map((item) => item.id)),
  );

  return {
    version: MEMORY_CONTEXT_VERSION,
    generatedAt: new Date().toISOString(),
    organizationId: input.organizationId,
    totalIncluded: normalizedItems.length,
    facts: normalizedItems.filter((item) => item.type === MemoryItemType.FACT),
    processes: normalizedItems.filter(
      (item) => item.type === MemoryItemType.PROCESS,
    ),
    strategic: normalizedItems.filter(
      (item) => item.type === MemoryItemType.STRATEGIC,
    ),
    preferences: normalizedItems.filter(
      (item) => item.type === MemoryItemType.PREFERENCE,
    ),
    highlights: normalizedItems
      .filter((item) => !conflictItemIds.has(item.id))
      .slice(0, HIGHLIGHTS_LIMIT),
    conflicts,
  };
}

function normalizeMemoryItem(memoryItem: MemoryItemResult): MemoryContextItem {
  return {
    id: memoryItem.id,
    type: memoryItem.type,
    key: memoryItem.key.trim(),
    value: truncateValue(memoryItem.value.trim()),
    subjectType: memoryItem.subjectType,
    subjectId: memoryItem.subjectId,
    confidence: memoryItem.confidence,
    source: memoryItem.source,
    isUserConfirmed: memoryItem.isUserConfirmed,
    createdAt: memoryItem.createdAt.toISOString(),
    updatedAt: memoryItem.updatedAt.toISOString(),
  };
}

function compareMemoryContextItems(
  left: MemoryContextItem,
  right: MemoryContextItem,
): number {
  return (
    TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type] ||
    Number(right.isUserConfirmed) - Number(left.isUserConfirmed) ||
    getSourcePriority(left.source) - getSourcePriority(right.source) ||
    right.confidence - left.confidence ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}

function buildConflicts(
  items: MemoryContextItem[],
): MemoryContextConflict[] {
  const groupedItems = new Map<string, MemoryContextItem[]>();

  for (const item of items) {
    const groupKey = buildConflictGroupKey(item);
    const group = groupedItems.get(groupKey) ?? [];

    group.push(item);
    groupedItems.set(groupKey, group);
  }

  const conflicts: MemoryContextConflict[] = [];

  for (const group of groupedItems.values()) {
    const uniqueValues = new Set(group.map((item) => normalizeValue(item.value)));

    if (uniqueValues.size <= 1) {
      continue;
    }

    conflicts.push({
      type: group[0].type,
      key: group[0].key,
      items: group.sort(compareMemoryContextItems),
      reason: "MULTIPLE_ACTIVE_VALUES",
    });
  }

  return conflicts.sort((left, right) => {
    return (
      TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type] ||
      normalizeValue(left.key).localeCompare(normalizeValue(right.key), "tr-TR")
    );
  });
}

function buildConflictGroupKey(item: MemoryContextItem): string {
  return [item.type, normalizeValue(item.key)].join(":");
}

function getSourcePriority(source: string): number {
  return SOURCE_PRIORITY[source] ?? 99;
}

function clampMaxItems(maxItems: number | undefined): number {
  if (maxItems === undefined) {
    return DEFAULT_MAX_ITEMS;
  }

  if (!Number.isFinite(maxItems)) {
    return DEFAULT_MAX_ITEMS;
  }

  return Math.min(MAX_MAX_ITEMS, Math.max(MIN_MAX_ITEMS, Math.floor(maxItems)));
}

function truncateValue(value: string): string {
  if (value.length <= MAX_VALUE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_VALUE_LENGTH - 1).trim()}…`;
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
