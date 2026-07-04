import type {
  ExecutiveBrainSnapshot,
  ExecutiveBrainSnapshotUpdateMode,
  SchedulerModuleKey,
} from "./snapshot/snapshot.types";
import type { ExecutiveBrainSignal } from "./signal-extractor/signal-extractor.types";

/** Execution plan'ın öncelik sıralaması. */
export type ExecutiveBrainExecutionPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

/**
 * ExecutiveBrainExecutionPlan — Policy Engine'in verdiği execution kararı.
 *
 * Contract garantileri:
 *   - shouldRun: false ise modules listesi dikkate alınmaz.
 *   - modules: Scheduler bu listeye göre çalıştırır; sırası garantili değildir.
 *   - allowPartialResult: true ise bir worker hata verse de snapshot güncellenir.
 *   - expectedValue / estimatedCost: Policy Engine'in cost-value değerlendirmesi.
 */
export type ExecutiveBrainExecutionPlan = {
  shouldRun: boolean;
  reason: string;
  modules: SchedulerModuleKey[];
  priority: ExecutiveBrainExecutionPriority;
  timeoutMs: number;
  allowPartialResult: boolean;
  snapshotUpdateMode: ExecutiveBrainSnapshotUpdateMode;
  /** Policy Engine'in bu execution'dan beklediği değer. */
  expectedValue: "low" | "medium" | "high";
  /** Policy Engine'in bu execution için öngördüğü maliyet. */
  estimatedCost: "low" | "medium" | "high";
};

/**
 * ExecutiveBrainPolicy — Neyin, ne zaman, hangi öncelikle çalışacağına karar verir.
 * Scheduler uygulayıcıdır; bu interface karar yetkisini Policy Engine'e bırakır.
 */
export type ExecutiveBrainPolicy = {
  evaluate(input: ExecutiveBrainRuntimeInput): ExecutiveBrainExecutionPlan;
};

/** Runtime'a gelen tek bir giriş birimi. */
export type ExecutiveBrainRuntimeInput = {
  messageId: string;
  message: string;
  conversationId: string;
  organizationId: string;
  recentMessages?: string[];
  /** Signal Extractor tarafından önceden çıkarılmış sinyaller. */
  signals?: ExecutiveBrainSignal[];
};

/**
 * ExecutiveBrainRuntimeResult — Runtime'ın dışarıya döndürdüğü sonuç.
 *
 * Contract garantileri:
 *   - snapshot her zaman mevcuttur; hata durumunda status: "partial" veya workerError dolu olur.
 *   - executionPlan, kararın izlenebilirliği için sonuca eklenir.
 */
export type ExecutiveBrainRuntimeResult = {
  snapshot: ExecutiveBrainSnapshot;
  executionPlan: ExecutiveBrainExecutionPlan;
  durationMs: number;
};

/**
 * ExecutiveBrainSessionState — Conversation boyunca tutulan oturum durumu.
 * Request'e değil conversation'a bağlıdır; snapshot bu state üzerinden taşınır.
 */
export type ExecutiveBrainSessionState = {
  conversationId: string;
  organizationId: string;
  snapshot: ExecutiveBrainSnapshot | null;
  lastMessageId: string | null;
  lastUpdatedAt: string | null;
};
