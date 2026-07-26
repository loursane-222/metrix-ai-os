import type { ExecutionResult } from "@/lib/action-runtime/execution/execution.types";
import { projectActionResultV1 } from "./action-result.adapter";
import type { ActionResultV1 } from "./action-result.contracts";
import { recordActionResultTelemetry } from "./action-result.telemetry";

export function resolveActionResultV1(
  result: ExecutionResult,
  requestId: string | null = null,
): ActionResultV1 | null {
  const startedAt = performance.now();
  recordActionResultTelemetry({
    event: "action_result_projection_started",
    requestId,
    correlationId: result.correlationId,
    actionName: result.actionName,
  });
  try {
    const projection = projectActionResultV1(result);
    const event = projection.status === "NO_CHANGE"
      ? "action_result_no_change"
      : projection.status === "FAILED"
        ? "action_result_failed"
        : "action_result_resolved";
    recordActionResultTelemetry({
      event,
      result: projection,
      requestId,
      latencyMs: Math.round(performance.now() - startedAt),
    });
    recordActionResultTelemetry({
      event: "action_result_evidence_available_for_outcome",
      result: projection,
      requestId,
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return projection;
  } catch (error) {
    recordActionResultTelemetry({
      event: "action_result_projection_failed",
      requestId,
      correlationId: result.correlationId,
      actionName: result.actionName,
      latencyMs: Math.round(performance.now() - startedAt),
      fallbackReason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    });
    return null;
  }
}
