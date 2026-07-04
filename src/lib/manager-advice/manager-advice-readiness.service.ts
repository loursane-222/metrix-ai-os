import type { ResolvedManagerContext } from "./manager-context-resolver.types";
import type {
  ManagerAdviceReadiness,
  ManagerAdviceReadinessLevel,
} from "./manager-advice-readiness.types";

export function evaluateManagerAdviceReadiness(
  context: ResolvedManagerContext,
): ManagerAdviceReadiness {
  return {
    category: context.category,
    readiness: getReadinessLevel(context.missingMemoryKeys.length),
    knownMemoryKeys: [...context.knownMemoryKeys],
    missingMemoryKeys: [...context.missingMemoryKeys],
  };
}

function getReadinessLevel(
  missingMemoryKeyCount: number,
): ManagerAdviceReadinessLevel {
  if (missingMemoryKeyCount === 0) {
    return "READY";
  }

  if (missingMemoryKeyCount <= 2) {
    return "PARTIAL";
  }

  return "INSUFFICIENT";
}
