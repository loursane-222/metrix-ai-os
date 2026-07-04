import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";
import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";

export type ManagerContext = {
  category: ManagerAdviceCategory;
  relevantMemoryKeys: RecognitionMemoryKey[];
};
