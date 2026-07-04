import type { ExecutiveBrainSignal } from "../signal-extractor/signal-extractor.types";
import type { ExecutiveExecutionContext } from "../executive-adapter/execution-context.types";

/**
 * Hangi scheduler modülünün çalıştırılacağını ifade eder.
 * Scheduler uygulayıcıdır; bu anahtarlar üzerinden plan alır.
 */
export type SchedulerModuleKey =
  | "conversation-understanding"
  | "executive-context-builder"
  | "company-model"
  | "executive-reasoning"
  | "recommended-next-move"
  | "learning-loop"
  | "executive-brain-shadow"
  | "forecast"
  | "decision-loop"
  | "snapshot-composer";

/** Snapshot'ın güncellik ve hazırlık durumu. */
export type ExecutiveBrainSnapshotStatus =
  | "fresh"     // Yeni üretildi
  | "stale"     // Güncellenmesi gerekiyor
  | "partial"   // Bazı worker'lar tamamlanamadı
  | "empty";    // Henüz hiç üretilmedi

/** Snapshot'ın nasıl güncelleneceğini belirler. */
export type ExecutiveBrainSnapshotUpdateMode =
  | "full"      // Tüm alanları yeniden üret
  | "patch"     // Sadece değişen alanları güncelle
  | "skip";     // Mevcut snapshot'ı kullan; güncelleme yapma

/**
 * ExecutiveBrainSnapshot — Prompt-ready, sade executive bilgi özeti.
 *
 * Contract garantileri:
 *   - Full servis objeleri (ExecutiveOperatingSystem, ConversationUnderstanding vb.) taşımaz.
 *   - Tüm içerik string/scalar; doğrudan prompt'a eklenebilir.
 *   - confidence: 0–1 aralığında ondalıklı sayı.
 *   - Bu fazda persist edilmez; conversation-level bellektedir.
 */
export type ExecutiveBrainSnapshot = {
  status: ExecutiveBrainSnapshotStatus;
  generatedAt: string;
  sourceMessageId: string | null;
  /** GM'in mevcut değerlendirmesi; prompt'a doğrudan eklenebilir. */
  currentExecutiveOpinion: string | null;
  situationSummary: string | null;
  userIntentSummary: string | null;
  companySituationSummary: string | null;
  topPriority: string | null;
  topRisk: string | null;
  recommendedAction: string | null;
  openDecisionsSummary: string | null;
  commitmentsSummary: string | null;
  learningSummary: string | null;
  /** 0–1 aralığında. */
  confidence: number;
  staleReason: string | null;
  lastSignals: ExecutiveBrainSignal[];
  lastModulesRun: SchedulerModuleKey[];
  workerError: string | null;
};

/**
 * SnapshotComposerInput — Snapshot Composer için giriş.
 *
 * Contract garantileri:
 *   - workerOutputs: Telemetry/debug amaçlı; backward compatibility için korunur.
 *     Composer snapshot üretirken bu alanı okumaz.
 *   - executionContext: Snapshot üretiminin kaynağı. Adapter pipeline'ının runtime
 *     belleğidir; Composer typed field'ları doğrudan buradan okur.
 *     shouldRun:false durumunda null gelir.
 */
export type SnapshotComposerInput = {
  messageId: string;
  previousSnapshot: ExecutiveBrainSnapshot | null;
  /** Telemetry/debug. Backward compatibility için korunur; Composer tarafından okunmaz. */
  workerOutputs: Record<string, unknown>;
  /** Snapshot üretiminin kaynağı. Composer typed field'ları buradan okur. */
  executionContext: ExecutiveExecutionContext | null;
  signals: ExecutiveBrainSignal[];
  modulesRun: SchedulerModuleKey[];
  updateMode: ExecutiveBrainSnapshotUpdateMode;
};

/** SnapshotComposer'ın döndürdüğü sonuç. */
export type SnapshotComposerResult = {
  snapshot: ExecutiveBrainSnapshot;
  /** Güncellenen alan adları. */
  mergedFields: string[];
  /** Güncellenmeden atlanan alan adları. */
  skippedFields: string[];
};
