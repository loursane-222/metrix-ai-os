import {
  ApprovalRequiredError,
  ExecutionFailedError,
  ExecutionRejectedError,
  HandlerNotFoundError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  RegistryLookupFailedError,
} from "@/lib/action-runtime/execution";
import type { ActionResultStatusV1, ActionResultV1 } from "./action-result.contracts";
import { freezeActionResultV1 } from "./action-result.validation";

export function projectActionErrorResultV1(input: Readonly<{
  error: unknown;
  correlationId: string;
  actionName?: string;
  generatedAt?: string;
}>): ActionResultV1 {
  const mapped = mapError(input.error, input.actionName);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const result = freezeActionResultV1({
    schemaVersion: "1.0",
    actionResultId: `action-result:error:${input.correlationId}:${mapped.actionName}`,
    executionId: mapped.executionId,
    operationId: null,
    correlationId: input.correlationId,
    actionName: mapped.actionName,
    status: mapped.status,
    executionOutcome: mapped.status === "WAITING_APPROVAL"
      ? "WAITING_APPROVAL"
      : mapped.status === "BLOCKED"
        ? "BLOCKED"
        : "FAILED",
    target: { entityType: null, entityId: null },
    authorization: {
      status: mapped.authorizationStatus,
      approvalId: null,
      approvalRequired: mapped.status === "WAITING_APPROVAL",
    },
    mutation: {
      attempted: mapped.attempted,
      performed: false,
      changedFields: [],
      noChange: false,
    },
    completion: {
      startedAt: null,
      completedAt: generatedAt,
      retryable: mapped.retryable,
      idempotentReplay: false,
    },
    sideEffects: [],
    failure: {
      code: mapped.code,
      category: mapped.category,
      safeSummary: mapped.safeSummary,
    },
    evidence: mapped.executionId
      ? [{ id: mapped.executionId, kind: "EXECUTION" }]
      : [],
    generatedAt,
  });
  return result;
}

function mapError(error: unknown, fallbackActionName = "unknown.action"): {
  actionName: string;
  executionId: string | null;
  status: ActionResultStatusV1;
  authorizationStatus: ActionResultV1["authorization"]["status"];
  attempted: boolean;
  retryable: boolean | null;
  code: string;
  category: string;
  safeSummary: string;
} {
  const actionName = hasActionName(error) ? error.actionName : fallbackActionName;
  if (error instanceof ApprovalRequiredError) {
    return base(actionName, "WAITING_APPROVAL", "REQUIRES_APPROVAL", false, false, error.reasonCode ?? "APPROVAL_REQUIRED", "APPROVAL", "Action requires approval.");
  }
  if (error instanceof PolicyDeniedError || error instanceof ExecutionRejectedError) {
    const code = error instanceof PolicyDeniedError ? error.reasonCode : "EXECUTION_REJECTED";
    return base(actionName, "BLOCKED", "DENIED", false, false, code, "AUTHORIZATION", "Action was blocked.");
  }
  if (error instanceof IdempotencyConflictError) {
    return base(actionName, "BLOCKED", "UNKNOWN", false, error.reasonCode === "IN_PROGRESS", `IDEMPOTENCY_${error.reasonCode}`, "IDEMPOTENCY", "Action could not start because the request conflicts with an existing execution.");
  }
  if (error instanceof InputValidationError) {
    return base(actionName, "FAILED", "NOT_APPLICABLE", false, false, "INPUT_VALIDATION_FAILED", "VALIDATION", "Action input was invalid.");
  }
  if (error instanceof ExecutionFailedError) {
    return { ...base(actionName, "FAILED", "AUTHORIZED", true, true, "EXECUTION_FAILED", "EXECUTION", "Action execution failed."), executionId: error.executionId };
  }
  if (error instanceof RegistryLookupFailedError || error instanceof HandlerNotFoundError) {
    return base(actionName, "FAILED", "NOT_APPLICABLE", false, false, "ACTION_UNAVAILABLE", "REGISTRY", "Action execution is unavailable.");
  }
  return base(actionName, "FAILED", "UNKNOWN", false, null, "UNKNOWN_EXECUTION_FAILURE", "UNKNOWN", "Action execution failed.");
}

function base(
  actionName: string,
  status: ActionResultStatusV1,
  authorizationStatus: ActionResultV1["authorization"]["status"],
  attempted: boolean,
  retryable: boolean | null,
  code: string,
  category: string,
  safeSummary: string,
) {
  return { actionName, executionId: null, status, authorizationStatus, attempted, retryable, code, category, safeSummary };
}

function hasActionName(value: unknown): value is { actionName: string } {
  return typeof value === "object"
    && value !== null
    && "actionName" in value
    && typeof Reflect.get(value, "actionName") === "string";
}
