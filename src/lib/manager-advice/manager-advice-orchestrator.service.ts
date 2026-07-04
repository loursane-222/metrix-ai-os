import { classifyManagerAdvice } from "./manager-advice-classifier.service";
import { evaluateManagerAdviceReadiness } from "./manager-advice-readiness.service";
import { buildManagerContext } from "./manager-context-builder.service";
import { resolveManagerContext } from "./manager-context-resolver.service";
import { getManagerDecisionFramework } from "./manager-decision-framework-registry.service";
import type {
  AnalyzeManagerAdviceInput,
  ManagerAdviceAnalysis,
} from "./manager-advice-orchestrator.types";

export function analyzeManagerAdvice(
  input: AnalyzeManagerAdviceInput,
): ManagerAdviceAnalysis {
  const classification = classifyManagerAdvice({
    message: input.message,
  });
  const managerContext = buildManagerContext(classification.category);
  const resolvedContext = resolveManagerContext({
    category: managerContext.category,
    relevantMemoryKeys: managerContext.relevantMemoryKeys,
    activeMemories: input.activeMemories,
  });
  const framework = getManagerDecisionFramework(classification.category);
  const readiness = evaluateManagerAdviceReadiness(resolvedContext);

  return {
    category: classification.category,
    confidence: classification.confidence,
    framework,
    knownMemoryKeys: readiness.knownMemoryKeys,
    missingMemoryKeys: readiness.missingMemoryKeys,
    readiness: readiness.readiness,
  };
}
