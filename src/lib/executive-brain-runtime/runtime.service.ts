import type {
  ExecutiveBrainRuntimeInput,
  ExecutiveBrainRuntimeResult,
} from "./types";
import { readExecutiveBrainSnapshot } from "./snapshot/snapshot.reader";
import { writeExecutiveBrainSnapshot } from "./snapshot/snapshot.writer";
import { composeExecutiveBrainSnapshot } from "./snapshot/snapshot-composer.service";
import { extractExecutiveBrainSignals } from "./signal-extractor/signal-extractor.service";
import { buildExecutiveExecutionPlan } from "./planner/planner.service";
import { scheduleExecutiveExecution } from "./scheduler/scheduler.service";

/**
 * runExecutiveBrainRuntime — Executive Brain Runtime giriş noktası.
 *
 * Pipeline:
 *   readSnapshot → extractSignals → buildPlan → scheduleExecution
 *   → composeSnapshot → writeSnapshot → RuntimeResult
 *
 * Snapshot reader/writer ve planner stub'dır.
 * Planner shouldRun:false döndürdüğü sürece adapter pipeline çalışmaz.
 * Asla throw etmez.
 */
export async function runExecutiveBrainRuntime(
  input: ExecutiveBrainRuntimeInput,
): Promise<ExecutiveBrainRuntimeResult> {
  const start = Date.now();

  // 1. Mevcut snapshot'ı oku (stub → null)
  const existingSnapshot = await readExecutiveBrainSnapshot(input.conversationId);

  // 2. Mesajdan sinyalleri çıkar (stub → tek UNKNOWN sinyal)
  const signals = extractExecutiveBrainSignals({
    messageId: input.messageId,
    message: input.message,
    existingSignals: input.signals ?? [],
  });

  // 3. Execution planını oluştur (stub → shouldRun: false)
  const executionPlan = buildExecutiveExecutionPlan({
    runtimeInput: input,
    currentSnapshot: existingSnapshot,
    signals,
  });

  // 4. Plana göre worker'ları çalıştır
  const schedulerResult = await scheduleExecutiveExecution(executionPlan, input, existingSnapshot);

  // 5. Snapshot'ı oluştur
  const { snapshot } = composeExecutiveBrainSnapshot({
    messageId: input.messageId,
    previousSnapshot: existingSnapshot,
    workerOutputs: schedulerResult.workerOutputs,
    executionContext: schedulerResult.executionContext,
    signals,
    modulesRun: schedulerResult.modulesRun,
    updateMode: executionPlan.snapshotUpdateMode,
  });

  // 6. Snapshot'ı yaz (stub → no-op)
  await writeExecutiveBrainSnapshot({ conversationId: input.conversationId, snapshot });

  return {
    snapshot,
    executionPlan,
    durationMs: Date.now() - start,
  };
}
