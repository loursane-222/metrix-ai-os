import type { ExecutiveBrainExecutionPlan, ExecutiveBrainRuntimeInput } from "../types";
import type { ExecutiveBrainSnapshot, SchedulerModuleKey } from "../snapshot/snapshot.types";
import type { ExecutiveExecutionContext } from "../executive-adapter/execution-context.types";
import { runExecutiveAdapter } from "../executive-adapter/executive-adapter.service";

/** Scheduler'ın bir execution sonucunda döndürdüğü çıktı. */
export type SchedulerResult = {
  modulesRun: SchedulerModuleKey[];
  /** Telemetri/debug amaçlı. Snapshot Composer tarafından okunmaz. */
  workerOutputs: Record<string, unknown>;
  workerError: string | null;
  /** Adapter pipeline'ının runtime belleği. Snapshot Composer bu context'i kullanır. */
  executionContext: ExecutiveExecutionContext | null;
};

/**
 * scheduleExecutiveExecution — ExecutionPlan'e göre adapter pipeline'ı çalıştırır.
 *
 * - shouldRun:false veya modules boşsa boş SchedulerResult döner; executionContext null.
 * - Modules varsa runExecutiveAdapter çağırır; adapterResult.executionContext Scheduler'dan geçer.
 * - workerOutputs yalnızca telemetri; Composer executionContext'i okur.
 */
export async function scheduleExecutiveExecution(
  plan: ExecutiveBrainExecutionPlan,
  runtimeInput: ExecutiveBrainRuntimeInput,
  currentSnapshot: ExecutiveBrainSnapshot | null,
): Promise<SchedulerResult> {
  if (!plan.shouldRun || plan.modules.length === 0) {
    return {
      modulesRun: [],
      workerOutputs: {},
      workerError: null,
      executionContext: null,
    };
  }

  const adapterResult = await runExecutiveAdapter({
    organizationId: runtimeInput.organizationId,
    conversationId: runtimeInput.conversationId,
    messageId: runtimeInput.messageId,
    message: runtimeInput.message,
    modules: plan.modules,
    signals: runtimeInput.signals ?? [],
    recentMessages: runtimeInput.recentMessages,
    currentSnapshot,
  });

  const workerOutputs: Record<string, unknown> = {};
  for (const r of adapterResult.results) {
    workerOutputs[r.module] = {
      success: r.success,
      summary: r.summary,
      confidence: r.confidence,
      durationMs: r.durationMs,
      error: r.error,
    };
  }

  return {
    modulesRun: adapterResult.results.map((r) => r.module),
    workerOutputs,
    workerError: adapterResult.error,
    executionContext: adapterResult.executionContext,
  };
}
