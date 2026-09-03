import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApprovalRequestNotFoundError, InvalidApprovalStateError } from "@/lib/action-runtime/policy/policy.errors";
import { ApprovalRequiredError } from "@/lib/action-runtime/execution/execution.errors";

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
  ApprovalRequestNotFoundError,
  InvalidApprovalStateError,
}));

// executeCanonicalOperation's readback step (see write-capabilities.ts:
// customer.create/task.create/quote.create/customer.archive all pair with a
// readbackCapability) calls the real core services below — stub them to a
// found, non-null record so readback reports PASSED and this file's
// existing executeAction-level assertions stay the sole source of truth for
// what actually executed. Not exercising `search` here, so partial mocks
// (missing e.g. listCustomers) are safe.
vi.mock("@/lib/core/customers/customer.service", () => ({
  getCustomerByIdForOrganization: vi.fn().mockResolvedValue({ id: "readback-ok" }),
}));
vi.mock("@/lib/core/quotes/quote.service", () => ({
  findQuoteByIdForOrganization: vi.fn().mockResolvedValue({ id: "readback-ok" }),
}));
vi.mock("@/lib/core/tasks/task.service", () => ({
  findTaskById: vi.fn().mockResolvedValue({ id: "readback-ok" }),
}));
vi.mock("@/lib/core/orders/order.service", () => ({
  getOrderByIdForOrganization: vi.fn().mockResolvedValue({ id: "readback-ok" }),
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

  // End-to-end proof of real wave grouping: step1/step2 are independent
  // (wave 0, run concurrently), step3 depends on step1 via $stepRef (wave
  // 1, waits for it). Confirms the $stepRef is actually resolved to
  // step1's real result entityId once wave 0 settles.
  it("runs independent steps concurrently in one wave, then a dependent step in the next using its real result", async () => {
    mocks.create.mockResolvedValue(makeCreated(3));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "customer.create", input: { displayName: "Atlas" } },
      { actionName: "task.create", input: {} },
      { actionName: "order.create", input: { customerId: { $stepRef: 0 } } },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "customer.create", status: "COMPLETED", resultEntityType: "customer", resultEntityId: "c1" },
      { actionName: "task.create", status: "COMPLETED", resultEntityType: "task", resultEntityId: "t1" },
      { actionName: "order.create", status: "COMPLETED", resultEntityType: "order", resultEntityId: "o1" },
    ], "COMPLETED"));
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "order", entityId: "o1" } });

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "customer", actionName: "customer.create", argsTemplate: { displayName: "Atlas" } },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
      { domain: "order", actionName: "order.create", argsTemplate: { customerId: { $stepRef: 0 } } },
    ] } });

    expect(result.status).toBe("COMPLETED");
    // The dependent step's real call must have carried step1's actual
    // resolved customerId, not the unresolved $stepRef sentinel.
    expect(mocks.executeAction).toHaveBeenNthCalledWith(3, expect.objectContaining({ input: { customerId: "c1" } }));
  });

  // Regression for wave-parallel execution: task.create has no $stepRef
  // pointing at quote.set_lifecycle, so the two are independent and land
  // in the same wave — they run concurrently. The independent one must
  // still complete for real, not wait on its unrelated sibling's approval.
  it("completes an independent step in the same wave while its unrelated sibling pauses for approval", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.set_lifecycle", input: { quoteId: "q1", status: "CANCELLED" } },
      { actionName: "task.create", input: {} },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.set_lifecycle", status: "AWAITING_APPROVAL", approvalRequestId: "appr1" },
      { actionName: "task.create", status: "COMPLETED", resultEntityType: "task", resultEntityId: "t1" },
    ], "AWAITING_APPROVAL"));
    mocks.executeAction
      .mockRejectedValueOnce(new ApprovalRequiredError("quote.set_lifecycle"))
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } });
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
    // The independent sibling actually ran and completed in the same turn —
    // it was never left PENDING waiting on step1.
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "step2", organizationId: "org1" },
      data: expect.objectContaining({ status: "COMPLETED", resultEntityId: "t1" }),
    }));
    expect(mocks.executeAction).toHaveBeenCalledTimes(2);
  });

  // Regression: task.create here has no relationship to quote.create at
  // all, so it's an independent same-wave sibling and must still be
  // attempted (and succeed) even though quote.create fails — unlike a
  // genuine dependent (see the next test), which never gets attempted.
  it("still attempts an unrelated same-wave sibling when a step fails outright, but skips a later wave", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", input: {} },
      { actionName: "task.create", input: {} },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", status: "FAILED", errorMessage: "boom" },
      { actionName: "task.create", status: "COMPLETED", resultEntityType: "task", resultEntityId: "t1" },
    ], "FAILED"));
    mocks.executeAction
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } });

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "offer", actionName: "quote.create", argsTemplate: {} },
      { domain: "task", actionName: "task.create", argsTemplate: {} },
    ] } });

    expect(result.status).toBe("FAILED");
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step1", organizationId: "org1" }, data: expect.objectContaining({ status: "FAILED" }) }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("skips a genuine dependent (via $stepRef) when the step it depends on fails, without attempting it", async () => {
    mocks.create.mockResolvedValue(makeCreated(2));
    mocks.findFirstOrThrow.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", input: {} },
      { actionName: "task.create", input: { relatedQuoteId: { $stepRef: 0 } } },
    ]));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "quote.create", status: "FAILED", errorMessage: "boom" },
      { actionName: "task.create", status: "SKIPPED" },
    ], "FAILED"));
    mocks.executeAction.mockRejectedValueOnce(new Error("boom"));

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "offer", actionName: "quote.create", argsTemplate: {} },
      { domain: "task", actionName: "task.create", argsTemplate: { relatedQuoteId: { $stepRef: 0 } } },
    ] } });

    expect(result.status).toBe("FAILED");
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: { status: "SKIPPED" } }));
    // The dependent was never attempted at all — only one executeAction
    // call total, for the step that actually failed.
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
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

  // Regression for wave-parallel compensation: customer.create and
  // product.create are independent (both wave 0), task.create depends on
  // customer.create (wave 1) and fails. Both wave-0 steps must be
  // compensated — proving runCompensationPass actually processes a whole
  // wave of completed steps, not just a single one at a time.
  it("compensates every completed step in a wave concurrently, not just one, when a later dependent step fails", async () => {
    mocks.create.mockResolvedValue(makeCreated(3));
    mocks.findFirstOrThrow
      .mockResolvedValueOnce(makeOrchestrationRow([
        { actionName: "customer.create", input: { displayName: "Atlas" } },
        { actionName: "product.create", input: { name: "Widget" } },
        { actionName: "task.create", input: { customerId: { $stepRef: 0 } } },
      ]))
      .mockResolvedValue(makeOrchestrationRow([
        { actionName: "customer.create", status: "COMPLETED", resultEntityType: "customer", resultEntityId: "c1" },
        { actionName: "product.create", status: "COMPLETED", resultEntityType: "product", resultEntityId: "p1" },
        { actionName: "task.create", status: "FAILED", errorMessage: "boom" },
      ], "COMPENSATING"));
    mocks.findFirst.mockResolvedValue(makeOrchestrationRow([
      { actionName: "customer.create", status: "COMPENSATED", resultEntityType: "customer", resultEntityId: "c1" },
      { actionName: "product.create", status: "COMPENSATED", resultEntityType: "product", resultEntityId: "p1" },
      { actionName: "task.create", status: "FAILED", errorMessage: "boom" },
    ], "COMPENSATED"));
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "product", entityId: "p1" } })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "product", entityId: "p1" } });

    const result = await runOrchestration({ auth, triggerUtterance: "x", plan: { steps: [
      { domain: "customer", actionName: "customer.create", argsTemplate: { displayName: "Atlas" } },
      { domain: "product", actionName: "product.create", argsTemplate: { name: "Widget" } },
      { domain: "task", actionName: "task.create", argsTemplate: { customerId: { $stepRef: 0 } } },
    ] } });

    expect(result.status).toBe("COMPENSATED");
    expect(mocks.executeAction).toHaveBeenCalledTimes(5);
    expect(mocks.executeAction).toHaveBeenCalledWith(expect.objectContaining({ actionName: "customer.archive", input: { customerId: "c1" } }));
    expect(mocks.executeAction).toHaveBeenCalledWith(expect.objectContaining({ actionName: "product.archive", input: { productServiceId: "p1" } }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step1", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPENSATED" }) }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPENSATED" }) }));
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
