import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";
import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerAdviceReadinessLevel } from "./manager-advice-readiness.types";
import type { ManagerDecisionStep } from "./manager-decision-framework.types";

export type ManagerAdviceBrief = {
  category: ManagerAdviceCategory;
  readiness: ManagerAdviceReadinessLevel;
  knownMemoryKeys: RecognitionMemoryKey[];
  missingMemoryKeys: RecognitionMemoryKey[];
  frameworkTitle: string | null;
  frameworkSteps: ManagerDecisionStep[];
};
