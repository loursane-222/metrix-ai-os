import { describe, expect, it, vi } from "vitest";

import { IdempotencyConflictError } from "../../execution";
import { InvalidApprovalStateError } from "../../policy";
import type { ApprovalGrant, ApprovalRequest } from "../../policy";
import type { ActionExecutionRequest, ExecutionResult } from "../../execution";
import { executeApprovedAction } from "../approved-action-execution";

const request: ActionExecutionRequest = {
  actionName: "payment.apply",
  input: { paymentId: "payment-1", amount: 100 },
  entityRef: { entityType: "payment", entityId: "payment-1" },
  executionContext: {
    actorId: "actor-1",
    organizationId: "org-1",
    role: "OWNER",
    permissions: ["payments.write"],
    sessionRef: "session-1",
    issuedAt: "2026-08-05T10:00:00.000Z",
    expiresAt: "2026-08-05T11:00:00.000Z",
  },
  idempotencyKey: "key-1",
  normalizedInputHash: "hash-1",
  correlationId: "corr-1",
};

const approval: ApprovalRequest = {
  approvalId: "approval-1",
  actionName: request.actionName,
  targetEntityRef: request.entityRef,
  normalizedInputHash: request.normalizedInputHash,
  actorId: request.executionContext.actorId,
  organizationId: request.executionContext.organizationId,
  approvalTtlClass: "SHORT",
  riskLevel: "HIGH",
  correlationId: request.correlationId,
  idempotencyKey: "approval-key-1",
  createdAt: "2026-08-05T10:00:00.000Z",
  expiresAt: "2026-08-05T10:15:00.000Z",
  status: "PENDING",
};

const grant: ApprovalGrant = {
  approvalId: approval.approvalId,
  actionName: approval.actionName,
  targetEntityRef: approval.targetEntityRef,
  boundInputHash: approval.normalizedInputHash,
  boundActorId: approval.actorId,
  boundOrganizationId: approval.organizationId,
  grantedAt: "2026-08-05T10:00:01.000Z",
  expiresAt: approval.expiresAt,
  singleUse: true,
};

const result: ExecutionResult = {
  actionName: request.actionName,
  executionId: "execution-1",
  status: "SUCCESS",
  outcome: "SUCCEEDED",
  correlationId: request.correlationId,
  operationId: "operation-1",
  entityRef: request.entityRef,
  startedAt: "2026-08-05T10:00:01.000Z",
  completedAt: "2026-08-05T10:00:02.000Z",
  metadata: { stagesCompleted: ["COMPLETION", "RESULT_BUILDING"] },
};

describe("executeApprovedAction", () => {
  it("replays across separate runtime instances before reading or consuming a one-time approval", async () => {
    let completedResult: ExecutionResult | undefined;
    let approvalStatus: ApprovalRequest["status"] = "PENDING";
    let handlerInvocations = 0;
    let approvalConsumptions = 0;
    let operationsCreated = 0;
    let mutations = 0;

    const policy = {
      getApprovalRequest: vi.fn(async () => ({ ...approval, status: approvalStatus })),
      getApprovalGrant: vi.fn(async () => grant),
      grantApproval: vi.fn(async () => {
        approvalStatus = "GRANTED";
        return grant;
      }),
    };
    const runtimeA = {
      lookupCompletedResult: vi.fn(async () => completedResult),
      executeAction: vi.fn(async () => {
        approvalConsumptions += 1;
        approvalStatus = "CONSUMED";
        operationsCreated += 1;
        handlerInvocations += 1;
        mutations += 1;
        completedResult = result;
        return result;
      }),
    };
    const runtimeB = {
      lookupCompletedResult: vi.fn(async () => completedResult),
      executeAction: vi.fn(async () => { throw new Error("replay must not execute"); }),
    };

    const first = await executeApprovedAction(
      { request, approvalId: approval.approvalId, grantedBy: "actor-1" },
      { policy, runtime: runtimeA },
    );
    const replay = await executeApprovedAction(
      { request, approvalId: approval.approvalId, grantedBy: "actor-1" },
      { policy, runtime: runtimeB },
    );

    expect(replay).toEqual(first);
    expect(replay.executionId).toBe(first.executionId);
    expect(replay.operationId).toBe(first.operationId);
    expect(policy.getApprovalRequest).toHaveBeenCalledTimes(1);
    expect(policy.grantApproval).toHaveBeenCalledTimes(1);
    expect(approvalConsumptions).toBe(1);
    expect(operationsCreated).toBe(1);
    expect(handlerInvocations).toBe(1);
    expect(mutations).toBe(1);
    expect(runtimeB.executeAction).not.toHaveBeenCalled();
  });

  it("checks durable replay before approval lookup", async () => {
    const lookupCompletedResult = vi.fn(async () => result);
    const getApprovalRequest = vi.fn(async () => { throw new Error("consumed approval was read"); });

    await expect(executeApprovedAction(
      { request, approvalId: approval.approvalId, grantedBy: "actor-1" },
      {
        policy: { getApprovalRequest, getApprovalGrant: vi.fn(), grantApproval: vi.fn() },
        runtime: { lookupCompletedResult, executeAction: vi.fn() },
      },
    )).resolves.toEqual(result);
    expect(getApprovalRequest).not.toHaveBeenCalled();
  });

  it("preserves a completed-key input conflict before approval lookup", async () => {
    const conflict = new IdempotencyConflictError(request.idempotencyKey, "INPUT_MISMATCH");
    const getApprovalRequest = vi.fn();
    await expect(executeApprovedAction(
      { request: { ...request, input: { paymentId: "payment-1", amount: 101 }, normalizedInputHash: "hash-2" }, approvalId: approval.approvalId, grantedBy: "actor-1" },
      {
        policy: { getApprovalRequest, getApprovalGrant: vi.fn(), grantApproval: vi.fn() },
        runtime: { lookupCompletedResult: vi.fn(async () => { throw conflict; }), executeAction: vi.fn() },
      },
    )).rejects.toBe(conflict);
    expect(getApprovalRequest).not.toHaveBeenCalled();
  });

  it("still rejects a genuinely new key whose approval is consumed", async () => {
    const consumed = { ...approval, status: "CONSUMED" as const };
    const invalidState = new InvalidApprovalStateError(approval.approvalId, "CONSUMED", "grantApproval");
    const executeAction = vi.fn();
    await expect(executeApprovedAction(
      { request: { ...request, idempotencyKey: "key-2" }, approvalId: approval.approvalId, grantedBy: "actor-1" },
      {
        policy: {
          getApprovalRequest: vi.fn(async () => consumed),
          getApprovalGrant: vi.fn(),
          grantApproval: vi.fn(async () => { throw invalidState; }),
        },
        runtime: { lookupCompletedResult: vi.fn(async () => undefined), executeAction },
      },
    )).rejects.toBe(invalidState);
    expect(executeAction).not.toHaveBeenCalled();
  });
});
