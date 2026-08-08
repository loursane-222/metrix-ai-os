import type { ExecutiveDecisionCalibrationV1 } from "@/lib/ai/executive-directive/contracts";

export type ExecutivePauseBand = "immediate" | "management" | "strategic";

export type ExecutivePauseSignal = Readonly<{
  signature: "executive.pause";
  band: ExecutivePauseBand;
  delayMs: number;
  category: string | null;
  priority: string | null;
}>;

const STRATEGIC_CATEGORIES = new Set([
  "CASH",
  "STRATEGY",
  "CASH_FLOW_RISK",
  "FORECAST_RISK",
  "DECISION_FOLLOW_UP",
]);

/**
 * A deterministic projection of the prior completed turn's real Decision
 * Engine calibration. Missing calibration means no pause; no synthetic signal
 * or random timing is introduced.
 */
export function resolveExecutivePause(
  calibration: ExecutiveDecisionCalibrationV1 | null,
): ExecutivePauseSignal {
  const decision = calibration?.primaryDecision;
  if (!decision) return { signature: "executive.pause", band: "immediate", delayMs: 0, category: null, priority: null };

  const priority = decision.priority.toUpperCase();
  const category = decision.category.toUpperCase();
  if (priority === "CRITICAL" || (priority === "HIGH" && STRATEGIC_CATEGORIES.has(category))) {
    return { signature: "executive.pause", band: "strategic", delayMs: 900, category, priority };
  }
  if (["MEDIUM", "HIGH", "CRITICAL"].includes(priority)) {
    return { signature: "executive.pause", band: "management", delayMs: 450, category, priority };
  }
  return { signature: "executive.pause", band: "immediate", delayMs: 0, category, priority };
}
