import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";
import type {
  ResolveManagerContextInput,
  ResolvedManagerContext,
} from "./manager-context-resolver.types";

export function resolveManagerContext(
  input: ResolveManagerContextInput,
): ResolvedManagerContext {
  const activeMemoryKeys = new Set(
    input.activeMemories.map((memory) => normalizeMemoryKey(memory.key)),
  );

  const knownMemoryKeys: RecognitionMemoryKey[] = [];
  const missingMemoryKeys: RecognitionMemoryKey[] = [];

  for (const key of input.relevantMemoryKeys) {
    if (activeMemoryKeys.has(normalizeMemoryKey(key))) {
      knownMemoryKeys.push(key);
    } else {
      missingMemoryKeys.push(key);
    }
  }

  return {
    category: input.category,
    knownMemoryKeys,
    missingMemoryKeys,
  };
}

function normalizeMemoryKey(key: string): string {
  return key.trim().toLowerCase();
}
