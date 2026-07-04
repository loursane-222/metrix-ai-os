import type { Memory, MemoryType, Prisma } from "@prisma/client";

export type CreateMemoryInput = {
  organizationId: string;
  sourceEventId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  type: MemoryType;
  title: string;
  content: string;
  importance?: number;
  confidence?: number;
  metadata?: Prisma.InputJsonValue;
};

export type ListMemoriesByEntityInput = {
  organizationId: string;
  entityType: string;
  entityId: string;
  limit?: number;
};

export type ListMemoriesByTypeInput = {
  organizationId: string;
  type: MemoryType;
  limit?: number;
};

export type CreateMemoryFromEventInput = {
  organizationId: string;
  sourceEventId: string;
  type: MemoryType;
  title: string;
  content: string;
  entityType?: string | null;
  entityId?: string | null;
  importance?: number;
  confidence?: number;
  metadata?: Prisma.InputJsonValue;
};

export type CreateManualMemoryInput = {
  organizationId: string;
  actorUserId: string;
  type: MemoryType;
  title: string;
  content: string;
  entityType?: string | null;
  entityId?: string | null;
  importance?: number;
  confidence?: number;
  metadata?: Prisma.InputJsonValue;
};

export type MemoryResult = Memory;

export type OrganizationMemoryContext = {
  importantMemories: MemoryResult[];
  recentMemories: MemoryResult[];
  facts: MemoryResult[];
  people: MemoryResult[];
  processes: MemoryResult[];
  relationships: MemoryResult[];
  preferences: MemoryResult[];
};
