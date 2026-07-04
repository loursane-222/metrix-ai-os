import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type {
  ManagerAdviceCategory,
  ManagerAdviceConfidence,
} from "./manager-advice-classifier.types";
import type { ManagerAdviceReadinessLevel } from "./manager-advice-readiness.types";
import type { ManagerDecisionFramework } from "./manager-decision-framework.types";
import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";

export type AnalyzeManagerAdviceInput = {
  message: string;
  activeMemories: MemoryItemResult[];
};

export type ManagerAdviceAnalysis = {
  category: ManagerAdviceCategory;
  confidence: ManagerAdviceConfidence;
  framework: ManagerDecisionFramework | null;
  knownMemoryKeys: RecognitionMemoryKey[];
  missingMemoryKeys: RecognitionMemoryKey[];
  readiness: ManagerAdviceReadinessLevel;
};
