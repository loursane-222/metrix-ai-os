import type { ManagerAdviceAnalysis } from "./manager-advice-orchestrator.types";
import type { ManagerAdviceBrief } from "./manager-advice-brief.types";

export function buildManagerAdviceBrief(
  analysis: ManagerAdviceAnalysis,
): ManagerAdviceBrief {
  return {
    category: analysis.category,
    readiness: analysis.readiness,
    knownMemoryKeys: [...analysis.knownMemoryKeys],
    missingMemoryKeys: [...analysis.missingMemoryKeys],
    frameworkTitle: analysis.framework?.title ?? null,
    frameworkSteps: analysis.framework
      ? analysis.framework.steps.map((step) => ({ ...step }))
      : [],
  };
}
