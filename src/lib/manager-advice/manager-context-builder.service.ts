import type { RecognitionMemoryKey } from "@/lib/recognition/recognition-snapshot.types";
import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerContext } from "./manager-context-builder.types";

const MANAGER_CONTEXT_MEMORY_KEYS: Record<
  ManagerAdviceCategory,
  RecognitionMemoryKey[]
> = {
  PRICING: [
    "strategic_focus",
    "primary_customer_type",
    "industry",
    "profitability_focus",
  ],
  COLLECTION: ["cashflow_priority", "primary_customer_type"],
  TEAM: ["team_size", "work_preference"],
  CUSTOMER_CONFLICT: ["communication_preference", "primary_customer_type"],
  SALES: ["strategic_focus", "primary_customer_type"],
  OPERATIONS: ["team_size", "industry"],
  STRATEGY: ["top_goal", "strategic_focus"],
  PERSONAL: ["personal_preference"],
  HIRING: ["team_size", "work_preference"],
  CASHFLOW: ["cashflow_priority", "profitability_focus"],
  GENERAL: [],
};

export function buildManagerContext(
  category: ManagerAdviceCategory,
): ManagerContext {
  return {
    category,
    relevantMemoryKeys: [...MANAGER_CONTEXT_MEMORY_KEYS[category]],
  };
}
