import type { CoreStatus, FinalState, SideEffectStatus } from "./operation.types";

const VALID_CORE_TRANSITIONS: Readonly<Record<CoreStatus, readonly CoreStatus[]>> = {
  PENDING: ["EXECUTING"],
  EXECUTING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: [],
};

export function isValidCoreStatusTransition(from: CoreStatus, to: CoreStatus): boolean {
  return VALID_CORE_TRANSITIONS[from].includes(to);
}

const UNRESOLVED_STATUSES: readonly SideEffectStatus[] = ["PENDING", "PROCESSING", "RETRYING"];
const TERMINALLY_FAILED_STATUSES: readonly SideEffectStatus[] = ["FAILED", "DEAD_LETTERED"];

/**
 * finalState yalnızca coreStatus + yan-etki/event tüketim durumlarının
 * birleşiminden türetilir. Customers'a özgü hiçbir kural içermez.
 */
export function deriveFinalState(coreStatus: CoreStatus, effectStatuses: readonly SideEffectStatus[]): FinalState {
  if (coreStatus === "PENDING" || coreStatus === "EXECUTING") {
    return "IN_PROGRESS";
  }

  const hasSucceeded = effectStatuses.some((status) => status === "SUCCEEDED");
  const hasUnresolved = effectStatuses.some((status) => UNRESOLVED_STATUSES.includes(status));
  const hasTerminallyFailed = effectStatuses.some((status) => TERMINALLY_FAILED_STATUSES.includes(status));

  if (coreStatus === "FAILED") {
    return hasSucceeded ? "FAILED_WITH_PARTIAL_SIDE_EFFECT" : "FAILED";
  }

  // coreStatus === "SUCCEEDED"
  if (effectStatuses.length === 0) {
    return "COMPLETED";
  }

  if (hasUnresolved) {
    return "COMPLETED_WITH_PENDING_SIDE_EFFECT";
  }

  if (hasTerminallyFailed) {
    return "FAILED_WITH_PARTIAL_SIDE_EFFECT";
  }

  return "COMPLETED";
}
