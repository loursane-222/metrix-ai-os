import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  stepUpdateMany: vi.fn(),
  updateMany: vi.fn(),
  findFirstOrThrow: vi.fn(),
  executeAction: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    executiveOrchestration: { create: mocks.create, updateMany: mocks.updateMany, findFirstOrThrow: mocks.findFirstOrThrow },
    orchestrationStep: { updateMany: mocks.stepUpdateMany },
  },
}));
vi.mock("@/lib/action-runtime/composition/production-execution-runtime", () => ({
  productionExecutionRuntime: { executeAction: mocks.executeAction },
}));

const { runOrchestration } = await import("../executive-orchestration.service");

const auth = {
  organization: { id: "org1" },
  user: { id: "user1" },
  membership: { role: "OWNER" },
  session: { id: "s1", createdAt: new Date(), expiresAt: new Date() },
} as never;

function makeOrchestration(stepCount: number) {
  return {
    id: "orch1",
    steps: Array.from({ length: stepCount }, (_, i) => ({ id: `step${i + 1}`, sequence: i + 1 })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stepUpdateMany.mockResolvedValue({ count: 1 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("runOrchestration", () => {
  it("marks the orchestration COMPLETED when every step succeeds", async () => {
    mocks.create.mockResolvedValue(makeOrchestration(2));
    mocks.executeAction
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "quote", entityId: "q1" } })
      .mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } });
    mocks.findFirstOrThrow.mockResolvedValue({ id: "orch1", status: "COMPLETED", triggerUtterance: "x", steps: [] });

    await runOrchestration({
      auth,
      triggerUtterance: "x",
      plan: {
        steps: [
          { domain: "offer", actionName: "quote.create", buildInput: () => ({}) },
          { domain: "task", actionName: "task.create", buildInput: () => ({}) },
        ],
      },
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "orch1", organizationId: "org1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step1", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPLETED" }) }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("skips remaining steps and marks PARTIALLY_COMPLETED when a later step fails after an earlier one succeeded", async () => {
    mocks.create.mockResolvedValue(makeOrchestration(2));
    mocks.executeAction.mockResolvedValueOnce({ status: "SUCCESS", entityRef: { entityType: "quote", entityId: "q1" } });
    mocks.executeAction.mockRejectedValueOnce(new Error("boom"));
    mocks.findFirstOrThrow.mockResolvedValue({ id: "orch1", status: "PARTIALLY_COMPLETED", triggerUtterance: "x", steps: [] });

    await runOrchestration({
      auth,
      triggerUtterance: "x",
      plan: {
        steps: [
          { domain: "offer", actionName: "quote.create", buildInput: () => ({}) },
          { domain: "task", actionName: "task.create", buildInput: () => ({}) },
        ],
      },
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "orch1", organizationId: "org1" },
      data: expect.objectContaining({ status: "PARTIALLY_COMPLETED" }),
    }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: expect.objectContaining({ status: "FAILED", errorMessage: "boom" }) }));
  });

  it("marks the orchestration FAILED and skips every remaining step when the first step fails", async () => {
    mocks.create.mockResolvedValue(makeOrchestration(2));
    mocks.executeAction.mockResolvedValueOnce({ status: "FAILURE", outcome: "APPROVAL_GRANT_MISSING" });
    mocks.findFirstOrThrow.mockResolvedValue({ id: "orch1", status: "FAILED", triggerUtterance: "x", steps: [] });

    await runOrchestration({
      auth,
      triggerUtterance: "x",
      plan: {
        steps: [
          { domain: "offer", actionName: "quote.create", buildInput: () => ({}) },
          { domain: "task", actionName: "task.create", buildInput: () => ({}) },
        ],
      },
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "orch1", organizationId: "org1" },
      data: expect.objectContaining({ status: "FAILED" }),
    }));
    expect(mocks.stepUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "step2", organizationId: "org1" }, data: { status: "SKIPPED" } }));
    expect(mocks.executeAction).toHaveBeenCalledTimes(1);
  });
});
