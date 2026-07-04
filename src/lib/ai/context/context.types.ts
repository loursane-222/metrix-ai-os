import type { MemoryResult } from "@/lib/core/memories/memory.types";

export type AiMemoryContext = {
  importantMemories: MemoryResult[];
  recentMemories: MemoryResult[];
  facts: MemoryResult[];
  people: MemoryResult[];
  processes: MemoryResult[];
  relationships: MemoryResult[];
  preferences: MemoryResult[];
};

