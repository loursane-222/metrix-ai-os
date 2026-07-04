import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerAdviceReadinessLevel } from "./manager-advice-readiness.types";

export type ManagerAdviceComposedResponse = {
  category: ManagerAdviceCategory;
  readiness: ManagerAdviceReadinessLevel;
  message: string;
};
