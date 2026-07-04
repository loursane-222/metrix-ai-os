import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";
import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";

export type ManagerAdviceReadinessLevel =
  | "READY"
  | "PARTIAL"
  | "INSUFFICIENT";

export type ManagerAdviceReadiness = {
  category: ManagerAdviceCategory;
  readiness: ManagerAdviceReadinessLevel;
  knownMemoryKeys: RecognitionMemoryKey[];
  missingMemoryKeys: RecognitionMemoryKey[];
};
