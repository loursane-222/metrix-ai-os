import type { SchedulerModuleKey } from "../snapshot/snapshot.types";

/** Modülün çalışmaya hazırlık durumu. */
export type ExecutiveModuleStatus = "active" | "disabled" | "experimental";

/** Modülün diğer modüllerle çalışma biçimi. */
export type ExecutiveModuleExecutionMode = "sequential" | "parallel";

/**
 * ExecutiveModuleDefinition — Tek bir modülün registry kaydı.
 *
 * Contract garantileri:
 *   - key: SchedulerModuleKey ile 1:1 eşleşir.
 *   - dependencies: Boş dizi "bağımlılık yok" anlamına gelir.
 *   - producesSnapshotFields: Bu modülün dolduracağı snapshot alan adları.
 *   - adapterName: Adapter katmanında kullanılacak tanımlayıcı.
 */
export type ExecutiveModuleDefinition = {
  key: SchedulerModuleKey;
  displayName: string;
  description: string;
  version: string;
  status: ExecutiveModuleStatus;
  defaultTimeoutMs: number;
  executionMode: ExecutiveModuleExecutionMode;
  dependencies: SchedulerModuleKey[];
  adapterName: string;
  producesSnapshotFields: string[];
};

/** Tüm modül tanımlarının merkezi haritası. */
export type ExecutiveModuleRegistry = {
  modules: Record<SchedulerModuleKey, ExecutiveModuleDefinition>;
};
