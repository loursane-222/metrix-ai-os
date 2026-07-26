import { describe, expect, it, vi } from "vitest";
import {
  ApprovalRequiredError,
  ExecutionFailedError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  type ExecutionResult,
} from "@/lib/action-runtime/execution";
import {
  projectActionErrorResultV1,
  projectActionResultOutcomeEvidence,
  projectActionResultV1,
  resolveActionResultV1,
  summarizeActionResultV1,
  validateActionResultV1,
} from "@/lib/action-result";
import { projectActionResultToCustomerHandoff } from "@/lib/conversation-extensions/conversation-extension-handoff";

const NOW = "2026-07-26T12:00:00.000Z";

function execution(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    actionName: "customer.update",
    executionId: "exec_1",
    operationId: "op_1",
    correlationId: "corr_1",
    status: "SUCCESS",
    outcome: "SUCCEEDED",
    entityRef: { entityType: "Customer", entityId: "customer_1" },
    startedAt: NOW,
    completedAt: NOW,
    metadata: { stagesCompleted: [], changedFields: ["name", "email"] },
    ...overrides,
  };
}

describe("ActionResultV1 canonical projection", () => {
  it("projects a successful mutation as an immutable 1.0 contract", () => {
    const result = projectActionResultV1(execution(), NOW);
    expect(result).toMatchObject({
      schemaVersion: "1.0",
      status: "SUCCEEDED",
      executionOutcome: "SUCCEEDED",
      mutation: { attempted: true, performed: true, changedFields: ["name", "email"], noChange: false },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.mutation.changedFields)).toBe(true);
  });

  it("maps no-change without claiming a mutation", () => {
    const result = projectActionResultV1(execution({
      outcome: "NO_CHANGE",
      metadata: { stagesCompleted: [], noChange: true, changedFields: [] },
    }), NOW);
    expect(result.status).toBe("NO_CHANGE");
    expect(result.mutation).toEqual({
      attempted: true, performed: false, changedFields: [], noChange: true,
    });
  });

  it("maps a reported execution failure safely", () => {
    const result = projectActionResultV1(execution({
      status: "FAILURE", outcome: "FAILED", metadata: { stagesCompleted: [] },
    }), NOW);
    expect(result.status).toBe("FAILED");
    expect(result.failure.code).toBe("EXECUTION_REPORTED_FAILURE");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("marks an idempotent completed replay without creating a second authority", () => {
    const result = projectActionResultV1(execution({ outcome: "REPLAYED" }), NOW);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.completion.idempotentReplay).toBe(true);
  });

  it("drops unsafe changed field values and exposes only a structural summary", () => {
    const result = projectActionResultV1(execution({
      metadata: { stagesCompleted: [], changedFields: ["name", "password=value", { secret: true }] },
    }), NOW);
    expect(result.mutation.changedFields).toEqual(["name"]);
    expect(summarizeActionResultV1(result)).toEqual({
      actionName: "customer.update",
      status: "SUCCEEDED",
      targetType: "Customer",
      changedFieldCount: 1,
      approvalRequired: false,
      failureCode: null,
      sideEffectCount: 0,
    });
  });

  it("provides evidence for ExecutiveOutcome without creating management success", () => {
    const result = projectActionResultV1(execution(), NOW);
    const evidence = projectActionResultOutcomeEvidence(result);
    expect(evidence).toEqual({
      id: "action-result:exec_1",
      kind: "ACTION_RESULT",
      actionName: "customer.update",
      status: "SUCCEEDED",
    });
    expect(JSON.stringify(evidence)).not.toContain("ACHIEVED");
  });

  it("rejects contradictory approval and mutation state", () => {
    const result = projectActionErrorResultV1({
      error: new ApprovalRequiredError("customer.update"),
      correlationId: "corr_1",
      generatedAt: NOW,
    });
    expect(result.status).toBe("WAITING_APPROVAL");
    expect(result.authorization.approvalRequired).toBe(true);
    expect(result.mutation.performed).toBe(false);
    expect(() => validateActionResultV1({
      ...result,
      mutation: { ...result.mutation, performed: true },
    })).toThrow(/WAITING_APPROVAL/u);
  });

  it.each([
    [new PolicyDeniedError("customer.update", "PERMISSION_DENIED"), "BLOCKED", "PERMISSION_DENIED"],
    [new InputValidationError("customer.update", ["secret raw value"]), "FAILED", "INPUT_VALIDATION_FAILED"],
    [new ExecutionFailedError("customer.update", "exec_9", new Error("db password=secret")), "FAILED", "EXECUTION_FAILED"],
    [new IdempotencyConflictError("idem_1"), "BLOCKED", "IDEMPOTENCY_INPUT_MISMATCH"],
  ] as const)("maps typed execution errors without leaking raw details", (error, status, code) => {
    const result = projectActionErrorResultV1({ error, correlationId: "corr_1", generatedAt: NOW });
    expect(result.status).toBe(status);
    expect(result.failure.code).toBe(code);
    expect(JSON.stringify(result)).not.toMatch(/password=secret|secret raw value|stack/u);
  });

  it("projects canonical result to a narrow, backward-compatible handoff", () => {
    const handoff = projectActionResultToCustomerHandoff(
      projectActionResultV1(execution(), NOW),
      "UPDATE",
    );
    expect(handoff).toMatchObject({
      resultStatus: "EXECUTED",
      outcomeCode: "ACTION_SUCCEEDED",
      mutationPerformed: true,
      navigationRequested: false,
    });
  });

  it("keeps no-change and approval handoffs distinct from success", () => {
    const noChange = projectActionResultV1(execution({
      outcome: "NO_CHANGE",
      metadata: { stagesCompleted: [], noChange: true, changedFields: [] },
    }), NOW);
    const approval = projectActionErrorResultV1({
      error: new ApprovalRequiredError("customer.update"),
      correlationId: "corr_1",
      generatedAt: NOW,
    });
    expect(projectActionResultToCustomerHandoff(noChange, "UPDATE")).toMatchObject({
      outcomeCode: "ACTION_NO_CHANGE", mutationPerformed: false,
    });
    expect(projectActionResultToCustomerHandoff(approval, "UPDATE")).toMatchObject({
      resultStatus: "APPROVAL_REQUIRED", approvalRequired: true, mutationPerformed: false,
    });
  });

  it("uses a safe null fallback when projection validation fails after execution", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(resolveActionResultV1(execution({ correlationId: "" }))).toBeNull();
    expect(info).toHaveBeenCalledWith("action_result_projection_failed", expect.any(Object));
    info.mockRestore();
  });
});
