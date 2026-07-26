import type { ExecutionResult } from "@/lib/action-runtime/execution/execution.types";
import type {
  ActionResultOutcomeEvidenceV1,
  ActionResultV1,
} from "./action-result.contracts";
import { freezeActionResultV1 } from "./action-result.validation";

export function projectActionResultV1(
  result: ExecutionResult,
  generatedAt = new Date().toISOString(),
): ActionResultV1 {
    const changedFields = safeChangedFields(result.metadata.changedFields);
    const noChange =
      result.outcome === "NO_CHANGE"
      || result.metadata.noChange === true;
    const status = mapStatus(result, noChange);
    const performed = status === "SUCCEEDED";
    return freezeActionResultV1({
      schemaVersion: "1.0",
      actionResultId: `action-result:${result.executionId}`,
      executionId: result.executionId,
      operationId: result.operationId,
      correlationId: result.correlationId,
      actionName: result.actionName,
      status,
      executionOutcome: result.outcome,
      target: {
        entityType: result.entityRef?.entityType ?? null,
        entityId: result.entityRef?.entityId ?? null,
      },
      authorization: {
        status: "AUTHORIZED",
        approvalId: null,
        approvalRequired: false,
      },
      mutation: {
        attempted: result.status === "SUCCESS" || result.status === "FAILURE",
        performed,
        changedFields: performed ? changedFields : [],
        noChange,
      },
      completion: {
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        retryable: status === "FAILED" ? true : false,
        idempotentReplay: result.outcome === "REPLAYED",
      },
      sideEffects: [],
      failure: {
        code: status === "FAILED" ? "EXECUTION_REPORTED_FAILURE" : null,
        category: status === "FAILED" ? "EXECUTION" : null,
        safeSummary: status === "FAILED" ? "Action execution failed." : null,
      },
      evidence: [
        { id: result.executionId, kind: "EXECUTION" },
        { id: result.operationId, kind: "OPERATION" },
        { id: `action-result:${result.executionId}`, kind: "ACTION_RESULT" },
      ],
      generatedAt,
    });
}

export function projectActionResultOutcomeEvidence(
  result: ActionResultV1,
): ActionResultOutcomeEvidenceV1 {
  return Object.freeze({
    id: result.actionResultId,
    kind: "ACTION_RESULT",
    actionName: result.actionName,
    status: result.status,
  });
}

function mapStatus(result: ExecutionResult, noChange: boolean): ActionResultV1["status"] {
  if (result.status === "FAILURE" || result.outcome === "FAILED") return "FAILED";
  if (noChange) return "NO_CHANGE";
  return "SUCCEEDED";
}

function safeChangedFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((field): field is string =>
    typeof field === "string" && /^[A-Za-z][A-Za-z0-9_.]{0,79}$/u.test(field),
  ))].slice(0, 64);
}
