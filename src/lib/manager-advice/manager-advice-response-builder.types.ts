import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerAdviceReadinessLevel } from "./manager-advice-readiness.types";
import type { ManagerDecisionStep } from "./manager-decision-framework.types";

export type ManagerAdviceResponseDraft = {
  category: ManagerAdviceCategory;
  readiness: ManagerAdviceReadinessLevel;
  opening: string;
  knownContextNote: string | null;
  missingContextNote: string | null;
  decisionChecklist: ManagerDecisionStep[];
  recommendedStructure: string[];
};
