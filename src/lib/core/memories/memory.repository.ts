import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateMemoryInput,
  ListMemoriesByEntityInput,
  ListMemoriesByTypeInput,
  MemoryResult,
} from "./memory.types";

export async function createMemory(
  input: CreateMemoryInput,
  tx?: PrismaTransactionClient,
): Promise<MemoryResult> {
  const client = tx ?? prisma;

  return client.memory.create({
    data: {
      organizationId: input.organizationId,
      sourceEventId: input.sourceEventId,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      title: input.title,
      content: input.content,
      importance: input.importance,
      confidence: input.confidence,
      metadata: input.metadata,
    },
  });
}

export async function findMemoryById(id: string): Promise<MemoryResult | null> {
  return prisma.memory.findUnique({
    where: {
      id,
    },
  });
}

export async function listMemoriesByOrganization(
  organizationId: string,
): Promise<MemoryResult[]> {
  return prisma.memory.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function listMemoriesByEntity(
  input: ListMemoriesByEntityInput,
): Promise<MemoryResult[]> {
  return prisma.memory.findMany({
    where: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.limit,
  });
}

export async function listImportantMemories(
  organizationId: string,
  minImportance = 70,
  limit?: number,
): Promise<MemoryResult[]> {
  return prisma.memory.findMany({
    where: {
      organizationId,
      importance: {
        gte: minImportance,
      },
    },
    orderBy: [
      {
        importance: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    take: limit,
  });
}

export async function listRecentMemories(
  organizationId: string,
  limit = 20,
): Promise<MemoryResult[]> {
  return prisma.memory.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
}

export async function listMemoriesByType(
  input: ListMemoriesByTypeInput,
): Promise<MemoryResult[]> {
  return prisma.memory.findMany({
    where: {
      organizationId: input.organizationId,
      type: input.type,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.limit,
  });
}
