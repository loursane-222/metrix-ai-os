import {
  MANUAL_MEMORY_CREATED,
  MEMORY_CREATED,
} from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";
import { prisma } from "@/lib/core/shared/prisma";

import {
  createMemory,
  listImportantMemories,
  listMemoriesByType,
  listRecentMemories,
} from "./memory.repository";

import type {
  CreateManualMemoryInput,
  CreateMemoryFromEventInput,
  MemoryResult,
  OrganizationMemoryContext,
} from "./memory.types";

const MEMORY_CONTEXT_TYPE_LIMIT = 20;
const IMPORTANT_MEMORY_MIN_IMPORTANCE = 70;
const IMPORTANT_MEMORY_LIMIT = 20;
const RECENT_MEMORY_LIMIT = 20;

export async function createMemoryFromEvent(
  input: CreateMemoryFromEventInput,
): Promise<MemoryResult> {
  return prisma.$transaction(async (tx) => {
    const memory = await createMemory(
      {
        organizationId: input.organizationId,
        sourceEventId: input.sourceEventId,
        type: input.type,
        title: input.title,
        content: input.content,
        entityType: input.entityType,
        entityId: input.entityId,
        importance: input.importance,
        confidence: input.confidence,
        metadata: input.metadata,
      },
      tx,
    );

    await recordEvent(
      {
        organizationId: input.organizationId,
        eventType: MEMORY_CREATED,
        entityType: "Memory",
        entityId: memory.id,
        payload: {
          memoryId: memory.id,
          type: memory.type,
          title: memory.title,
          entityType: memory.entityType,
          entityId: memory.entityId,
          sourceEventId: memory.sourceEventId,
        },
        source: "SYSTEM",
      },
      tx,
    );

    return memory;
  });
}

export async function createManualMemory(
  input: CreateManualMemoryInput,
): Promise<MemoryResult> {
  return prisma.$transaction(async (tx) => {
    const manualMemoryEvent = await recordEvent(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        eventType: MANUAL_MEMORY_CREATED,
        entityType: "Memory",
        payload: {
          type: input.type,
          title: input.title,
          entityType: input.entityType,
          entityId: input.entityId,
        },
        source: "USER",
      },
      tx,
    );

    const memory = await createMemory(
      {
        organizationId: input.organizationId,
        sourceEventId: manualMemoryEvent.id,
        type: input.type,
        title: input.title,
        content: input.content,
        entityType: input.entityType,
        entityId: input.entityId,
        importance: input.importance,
        confidence: input.confidence,
        metadata: input.metadata,
      },
      tx,
    );

    await recordEvent(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        eventType: MEMORY_CREATED,
        entityType: "Memory",
        entityId: memory.id,
        payload: {
          memoryId: memory.id,
          type: memory.type,
          title: memory.title,
          entityType: memory.entityType,
          entityId: memory.entityId,
          sourceEventId: memory.sourceEventId,
        },
        source: "SYSTEM",
      },
      tx,
    );

    return memory;
  });
}

export async function getOrganizationMemoryContext(
  organizationId: string,
): Promise<OrganizationMemoryContext> {
  const [
    importantMemories,
    recentMemories,
    facts,
    people,
    processes,
    relationships,
    preferences,
  ] = await Promise.all([
    listImportantMemories(
      organizationId,
      IMPORTANT_MEMORY_MIN_IMPORTANCE,
      IMPORTANT_MEMORY_LIMIT,
    ),
    listRecentMemories(organizationId, RECENT_MEMORY_LIMIT),
    listMemoriesByType({
      organizationId,
      type: "FACT",
      limit: MEMORY_CONTEXT_TYPE_LIMIT,
    }),
    listMemoriesByType({
      organizationId,
      type: "PERSON",
      limit: MEMORY_CONTEXT_TYPE_LIMIT,
    }),
    listMemoriesByType({
      organizationId,
      type: "PROCESS",
      limit: MEMORY_CONTEXT_TYPE_LIMIT,
    }),
    listMemoriesByType({
      organizationId,
      type: "RELATIONSHIP",
      limit: MEMORY_CONTEXT_TYPE_LIMIT,
    }),
    listMemoriesByType({
      organizationId,
      type: "PREFERENCE",
      limit: MEMORY_CONTEXT_TYPE_LIMIT,
    }),
  ]);

  return {
    importantMemories,
    recentMemories,
    facts,
    people,
    processes,
    relationships,
    preferences,
  };
}
