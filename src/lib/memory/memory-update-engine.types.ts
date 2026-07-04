import type { MemoryItemType } from "@prisma/client";

import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";

export type MemoryUpdateDecisionKind =
  | "NO_CHANGE"
  | "SUPPORTS_EXISTING"
  | "CONFLICTS_WITH_EXISTING"
  | "UPDATE_EXISTING"
  | "CREATE_NEW";

export type MemoryUpdateDecision = {
  kind: MemoryUpdateDecisionKind;
  ruleId: string;
  proposedType: MemoryItemType;
  proposedKey: string;
  proposedValue: string;
  confidence: number;
  requiresApproval: boolean;
  reason: string;
  evidence: Record<string, unknown>;
  memoryItem?: MemoryItemResult;
  previousValue?: string;
  supersedesMemoryId?: string;
};

export type EvaluateMemoryUpdateInput = {
  activeMemoryItems: MemoryItemResult[];
  message: string;
};
