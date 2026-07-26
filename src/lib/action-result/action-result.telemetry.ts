import type { ActionResultV1 } from "./action-result.contracts";

export type ActionResultTelemetryEvent =
  | "action_result_projection_started"
  | "action_result_resolved"
  | "action_result_no_change"
  | "action_result_waiting_approval"
  | "action_result_failed"
  | "action_result_projection_failed"
  | "action_result_projected_to_conversation_handoff"
  | "action_result_evidence_available_for_outcome";

export function recordActionResultTelemetry(input: Readonly<{
  event: ActionResultTelemetryEvent;
  result?: ActionResultV1;
  requestId?: string | null;
  correlationId?: string | null;
  actionName?: string | null;
  latencyMs?: number;
  fallbackReason?: string | null;
}>): void {
  const result = input.result;
  console.info(input.event, {
    requestId: input.requestId ?? null,
    correlationId: result?.correlationId ?? input.correlationId ?? null,
    executionId: result?.executionId ?? null,
    operationId: result?.operationId ?? null,
    actionName: result?.actionName ?? input.actionName ?? null,
    status: result?.status ?? null,
    authorizationStatus: result?.authorization.status ?? "UNKNOWN",
    mutationPerformed: result?.mutation.performed ?? false,
    changedFieldCount: result?.mutation.changedFields.length ?? 0,
    sideEffectCount: result?.sideEffects.length ?? 0,
    failureCode: result?.failure.code ?? null,
    latencyMs: input.latencyMs ?? 0,
    fallbackReason: input.fallbackReason ?? null,
  });
}
