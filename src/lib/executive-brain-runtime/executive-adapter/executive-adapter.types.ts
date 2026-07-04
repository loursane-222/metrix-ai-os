import type { SchedulerModuleKey, ExecutiveBrainSnapshot } from "../snapshot/snapshot.types";
import type { ExecutiveBrainSignal } from "../signal-extractor/signal-extractor.types";
import type { ExecutiveExecutionContext } from "./execution-context.types";

/**
 * ExecutiveAdapterInput — Adapter'a verilen giriş; Scheduler bu nesneyi iletir.
 *
 * Contract garantileri:
 *   - recentMessages: Konuşma geçmişi; bağlam gerektiren modüller için (CU, reasoning vb.).
 *     ExecutiveBrainRuntimeInput'tan taşınır; yoksa modül sadece message ile çalışır.
 *   - currentSnapshot: Mevcut session snapshot'ı; stateful modüller için (learning-loop,
 *     decision-loop vb.). Henüz snapshot üretilmemişse null gelir.
 */
export type ExecutiveAdapterInput = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  message: string;
  modules: SchedulerModuleKey[];
  signals: ExecutiveBrainSignal[];
  recentMessages?: string[];
  currentSnapshot?: ExecutiveBrainSnapshot | null;
};

/**
 * ExecutiveAdapterModuleResult — Tek bir modül çalıştırmasının özet sonucu.
 *
 * Contract garantileri:
 *   - Full servis objesi (ExecutiveOperatingSystem, ConversationUnderstanding vb.) içermez.
 *   - summary: Snapshot Composer'ın kullanabileceği düz metin özet; null geçerlidir.
 *   - confidence: 0–1 aralığında; modül çalışmadıysa 0.
 */
export type ExecutiveAdapterModuleResult = {
  module: SchedulerModuleKey;
  success: boolean;
  summary: string | null;
  confidence: number;
  durationMs: number;
  error: string | null;
};

/**
 * ExecutiveAdapterResult — Tüm modül çalışmalarının toplu sonucu.
 *
 * Contract garantileri:
 *   - results: input.modules ile 1:1 eşleşir; boş dizi geçerlidir.
 *   - error: Pipeline geneli hata; modül hatası için her result.error'a bakılır.
 *   - executionContext: Pipeline boyunca biriken typed runtime belleği.
 *     Snapshot Composer bu context'i doğrudan okur; workerOutputs'a yazılmaz.
 */
export type ExecutiveAdapterResult = {
  results: ExecutiveAdapterModuleResult[];
  durationMs: number;
  error: string | null;
  executionContext: ExecutiveExecutionContext;
};
