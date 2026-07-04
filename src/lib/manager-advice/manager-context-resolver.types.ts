import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";
import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";

export type ResolveManagerContextInput = {
  category: ManagerAdviceCategory;
  relevantMemoryKeys: RecognitionMemoryKey[];
  activeMemories: MemoryItemResult[];
};

export type ResolvedManagerContext = {
  category: ManagerAdviceCategory;
  knownMemoryKeys: RecognitionMemoryKey[];
  missingMemoryKeys: RecognitionMemoryKey[];
};
