import type { ExecutiveBrainExecutionPlan } from "../types";
import type { PlannerInput } from "./planner.types";

/**
 * buildExecutiveExecutionPlan — Runtime için execution planı üretir.
 *
 * Bu fazda gerçek karar verilmez; her zaman shouldRun=false stub plan döner.
 * Saf fonksiyon; side-effect yoktur, throw etmez.
 * Gerçek policy değerlendirmesi ileriki fazda eklenecektir.
 */
export function buildExecutiveExecutionPlan(
  _input: PlannerInput,
): ExecutiveBrainExecutionPlan {
  return {
    shouldRun: false,
    reason: "planner_stub",
    modules: [],
    priority: "low",
    timeoutMs: 0,
    allowPartialResult: true,
    snapshotUpdateMode: "skip",
    expectedValue: "low",
    estimatedCost: "low",
  };
}
