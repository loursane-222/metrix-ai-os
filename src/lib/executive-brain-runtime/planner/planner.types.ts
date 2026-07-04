import type { ExecutiveBrainRuntimeInput } from "../types";
import type { ExecutiveBrainSnapshot } from "../snapshot/snapshot.types";
import type { ExecutiveBrainSignal } from "../signal-extractor/signal-extractor.types";

/**
 * PlannerInput — Planner'a verilen giriş.
 * Mevcut snapshot + çıkarılmış sinyaller karar için girdi oluşturur.
 */
export type PlannerInput = {
  runtimeInput: ExecutiveBrainRuntimeInput;
  currentSnapshot: ExecutiveBrainSnapshot | null;
  signals: ExecutiveBrainSignal[];
};
