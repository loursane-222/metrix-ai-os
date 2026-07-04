import { getMemoryContext } from "@/lib/application/memories/memory.service";

import type { AiMemoryContext } from "./context.types";

export async function buildMemoryContext(
  organizationId: string,
): Promise<AiMemoryContext> {
  const memoryContext = await getMemoryContext(organizationId);

  return {
    importantMemories: memoryContext.importantMemories,
    recentMemories: memoryContext.recentMemories,
    facts: memoryContext.facts,
    people: memoryContext.people,
    processes: memoryContext.processes,
    relationships: memoryContext.relationships,
    preferences: memoryContext.preferences,
  };
}

