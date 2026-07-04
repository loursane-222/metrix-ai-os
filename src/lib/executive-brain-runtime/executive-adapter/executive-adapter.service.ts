import type {
  ExecutiveAdapterInput,
  ExecutiveAdapterModuleResult,
  ExecutiveAdapterResult,
} from "./executive-adapter.types";
import type { ExecutiveExecutionContext } from "./execution-context.types";
import type { SchedulerModuleKey } from "../snapshot/snapshot.types";
import { resolveExecutiveModuleDependencies } from "../module-registry/module-registry.service";
import {
  runConversationUnderstandingAdapter,
  runExecutiveContextBuilderAdapter,
  runCompanyModelAdapter,
  runExecutiveReasoningAdapter,
  runRecommendedNextMoveAdapter,
  runLearningLoopAdapter,
  runExecutiveBrainShadowAdapter,
  runForecastAdapter,
  runDecisionLoopAdapter,
} from "./modules";

type ModuleAdapterFn = (
  input: ExecutiveAdapterInput,
  ctx: ExecutiveExecutionContext,
) => Promise<ExecutiveAdapterModuleResult>;

const MODULE_ADAPTER_MAP: Partial<Record<SchedulerModuleKey, ModuleAdapterFn>> = {
  "conversation-understanding": runConversationUnderstandingAdapter,
  "executive-context-builder": runExecutiveContextBuilderAdapter,
  "company-model": runCompanyModelAdapter,
  "executive-reasoning": runExecutiveReasoningAdapter,
  "recommended-next-move": runRecommendedNextMoveAdapter,
  "learning-loop": runLearningLoopAdapter,
  "executive-brain-shadow": runExecutiveBrainShadowAdapter,
  "forecast": runForecastAdapter,
  "decision-loop": runDecisionLoopAdapter,
};

/**
 * runExecutiveAdapter — ExecutionPlan modülleri için Executive Intelligence çağrılarını yönetir.
 *
 * Her çağrıda taze ExecutiveExecutionContext oluşturur.
 * Modülleri registry bağımlılık sırasına göre çalıştırır.
 * Tek modül hatası pipeline'ı durdurmaz.
 * Asla throw etmez; hata durumunda result.error doldurulur.
 */
export async function runExecutiveAdapter(
  input: ExecutiveAdapterInput,
): Promise<ExecutiveAdapterResult> {
  const start = Date.now();
  const ctx: ExecutiveExecutionContext = {};
  const resolvedModules = resolveExecutiveModuleDependencies(input.modules);
  const results: ExecutiveAdapterModuleResult[] = [];

  for (const moduleName of resolvedModules) {
    const adapterFn = MODULE_ADAPTER_MAP[moduleName];
    const moduleStart = Date.now();

    if (!adapterFn) {
      results.push({
        module: moduleName,
        success: false,
        summary: null,
        confidence: 0,
        durationMs: Date.now() - moduleStart,
        error: "no_adapter",
      });
      continue;
    }

    try {
      const result = await adapterFn(input, ctx);
      results.push(result);
    } catch (err) {
      results.push({
        module: moduleName,
        success: false,
        summary: null,
        confidence: 0,
        durationMs: Date.now() - moduleStart,
        error: err instanceof Error ? err.message : "adapter_runtime_error",
      });
    }
  }

  return {
    results,
    durationMs: Date.now() - start,
    error: null,
    executionContext: ctx,
  };
}
