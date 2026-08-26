import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirstOrThrow: vi.fn(),
  findFirst: vi.fn(),
  stepUpdateMany: vi.fn(),
  updateMany: vi.fn(),
  executeAction: vi.fn(),
  createApprovalRequest: vi.fn(),
  grantApproval: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    executiveOrchestration: {
      create: mocks.create,
      updateMany: mocks.updateMany,
      findFirstOrThrow: mocks.findFirstOrThrow,
      findFirst: mocks.findFirst,
    },
    orchestrationStep: { updateMany: mocks.stepUpdateMany },
  },
}));
vi.mock("@/lib/action-runtime/composition/production-execution-runtime", () => ({
  productionExecutionRuntime: { executeAction: mocks.executeAction },
}));
vi.mock("@/lib/action-runtime/policy", () => ({
  policyEngine: { createApprovalRequest: mocks.createApprovalRequest, grantApproval: mocks.grantApproval },
}));

const { runOrchestration, resumeOrchestration } = await import("../executive-orchestration.service");

const auth = {
  organization: { id: "org1" },
  user: { id: "user1" },
  membership: { role: "OWNER" },
  session: { id: "s1", createdAt: new Date(), expiresAt: new Date() },
} as never;

function makeCreated(stepCount: number) {
  return { id: "orch1", steps: Array.from({ length: stepCount }, (_, i) => ({ id: `step${i + 1}`, sequence: i + 1 })) };
}

function makeOrchestrationRow(steps: Array<Record<string, unknown>>, status = "RUNNING") {
  return {
    id: "orch1",
    organizationId: "org1",
    triggerUtterance: "x",
    status,
    steps: steps.map((s, i) => ({
      id: `step${i + 1}`,
      sequence: i + 1,
      domain: "d",
      actionName: "a",
      status: "PENDING",
      input: {},
      approvalRequestId: null,
      resultEntityType: null,
      resultEntityId: null,
      errorMessage: null,
      ...s,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stepUpdateMany.mockResolvedValue({ count: 1 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("runOrchestration", () => {
  it("marks the orchestration COMPLETED when every step succeeds", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", input: {} },
      { actionName: "task.create", input: {} },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", status: "COMPLETED", resultEntityType: "quote", resultEntityId: "q1" },
      { actionName: "task.create", status: "COMPLETED", resultEntityType: "task", resultEntityId: "t1" },
    ], "COMPLETED"));
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "quote", entityId: "q1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } });

    await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "offer", actionName: "quote.create", argsTemplate: {} },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
    ] } });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step1", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPLETED" }) }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("pauses in AWAITING_APPROVAL when a step throws ApprovalRequiredError, without touching later steps", async () => {
    // quote.set_lifecycle (not quote.dispatch) — same EXPLICIT-approval code
    // path, but not one of the two irreversible actions
    // validatePlanIrreversibleOrdering restricts to the plan's last step, so
    // this plan (an approval-gated step followed by a real later step) stays
    // valid.
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.set_lifecycle", input: { quoteId: "q1", status: "CANCELLED" } },
      { actionName: "task.create", input: {} },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.set_lifecycle", status: "AWAITING_APPROVAL", approvalRequestId: "appr1" },
      { actionName: "task.create", status: "PENDING" },
    ], "AWAITING_APPROVAL"));
    const approvalError = new Error("needs approval");
    approvalError.name = "ApprovalRequiredError";
    mocks.executeAction.mockRejectedValueOnce(approvalError);
    mocks.createApprovalRequest.mockResolvedValue({ approvalId: "appr1" });

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "offer", actionName: "quote.set_lifecycle", argsTemplate: { quoteId: "q1", status: "CANCELLED" } },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
    ] } });

    expect(result.status).toBe("AWAITING_APPROVAL");
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "step1", organizationId: "org1" },
      data: expect.objectContaining({ status: "AWAITING_APPROVAL", approvalRequestId: "appr1" }),
    }));
    // Step 2 must never be touched — it's still genuinely PENDING, not skipped.
    expect(mocks.stepUpdateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" } }));
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
  });

  it("marks FAILED and skips remaining steps when a step fails outright", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", input: {} },
      { actionName: "task.create", input: {} },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", status: "FAILED", errorMessage: "boom" },
      { actionName: "task.create", status: "SKIPPED" },
    ], "FAILED"));
    mocks.executeAction.mockRejectedValueOnce(new Error("boom"));

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "offer", actionName: "quote.create", argsTemplate: {} },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
    ] } });

    expect(result.status).toBe("FAILED");
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: { status: "SKIPPED" } }));
  });

  // customer.create/customer.archive is a real, already-working compensator
  // pair in the actual (unmocked) actionRegistry — used here instead of a
  // synthetic action name so this exercises the real
  // getActionDefinition()/deriveCompensationCalls() wiring, not just the
  // loop's own bookkeeping.
  it("compensates an earlier COMPLETED step when a later step fails outright", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow
      .mockResolvedValueOnce(makeOrchestrationRow([
        { actionName: "customer.create", input: { displayName: "Atlas" } },
        { actionName: "task.create", input: {} },
      ]))
      .mockResolvedValue(makeOrchestrationRow([
        { actionName: "customer.create", status: "COMPLETED", resultEntityType: "customer", resultEntityId: "c1" },
        { actionName: "task.create", status: "FAILED", errorMessage: "boom" },
      ], "COMPENSATING"));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "customer.create", status: "COMPENSATED", resultEntityType: "customer", resultEntityId: "c1" },
      { actionName: "task.create", status: "FAILED", errorMessage: "boom" },
    ], "COMPENSATED"));
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } });

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "customer", actionName: "customer.create", argsTemplate: { displayName: "Atlas" } },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
    ] } });

    expect(result.status).toBe("COMPENSATED");
    expect(mocks.executeAction).toHaveBeenCalledTimes(3);
    // The compensation call must run under a visibly distinct correlationId/
    // idempotencyKey namespace, not collide with the forward step's own.
    expect(mocks.executeAction).toHaveBeenNthCalledWith(3, expect.objectContaining({
      actionName: "customer.archive",
      input: { customerId: "c1" },
      correlationId: "orchestration:orch1:compensation",
      idempotencyKey: "orchestration:orch1:compensation:step:1:0",
    }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step1", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPENSATED" }) }));
  });

  it("lands on COMPENSATION_FAILED, not a silent partial state, when the compensation call itself fails", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow
      .mockResolvedValueOnce(makeOrchestrationRow([
        { actionName: "customer.create", input: { displayName: "Atlas" } },
        { actionName: "task.create", input: {} },
      ]))
      .mockResolvedValue(makeOrchestrationRow([
        { actionName: "customer.create", status: "COMPLETED", resultEntityType: "customer", resultEntityId: "c1" },
        { actionName: "task.create", status: "FAILED", errorMessage: "boom" },
      ], "COMPENSATING"));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "customer.create", status: "COMPENSATION_FAILED", resultEntityType: "customer", resultEntityId: "c1", errorMessage: "archive failed" },
      { actionName: "task.create", status: "FAILED", errorMessage: "boom" },
    ], "COMPENSATION_FAILED"));
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "FAILURE", outcome: "archive failed" });

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "customer", actionName: "customer.create", argsTemplate: { displayName: "Atlas" } },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
    ] } });

    expect(result.status).toBe("COMPENSATION_FAILED");
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "step1", organizationId: "org1" },
      data: expect.objectContaining({ status: "COMPENSATION_FAILED" }),
    }));
  });
});

describe("resumeOrchestration", () => {
  it("grants the pending approval and completes the remaining steps", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(makeOrchestrationRow([
        { actionName: "quote.dispatch", status: "AWAITING_APPROVAL", approvalRequestId: "appr1", input: { quoteId: "q1" } },
        { actionName: "task.create", status: "PENDING", input: {} },
      ], "AWAITING_APPROVAL"))
      .mockResolvedValueOnce(makeOrchestrationRow([
        { actionName: "quote.dispatch", status: "COMPLETED", resultEntityType: "quote", resultEntityId: "q1" },
        { actionName: "task.create", status: "COMPLETED", resultEntityType: "task", resultEntityId: "t1" },
      ], "COMPLETED"));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.dispatch", status: "AWAITING_APPROVAL", approvalRequestId: "appr1", input: { quoteId: "q1" } },
      { actionName: "task.create", status: "PENDING", input: {} },
    ], "AWAITING_APPROVAL"));
    mocks.grantApproval.mockResolvedValue({ approvalId: "appr1" });
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "quote", entityId: "q1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } });

    const result = await resumeOrchestration({ auth, orchestrationId: "orch1" });

    expect(mocks.grantApproval).toHaveBeenCalledWith("appr1", "user1");
    expect(result?.status).toBe("COMPLETED");
    // The resumed step's execution must carry the granted approval.
    expect(mocks.executeAction).toHaveBeenCalledWith(expect.objectContaining({ approvalGrant: { approvalId: "appr1" } }));
  });

  it("returns null when there is nothing awaiting approval for this org", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const result = await resumeOrchestration({ auth, orchestrationId: "missing" });
    expect(result).toBeNull();
    expect(mocks.grantApproval).not.toHaveBeenCalled();
  });
});
