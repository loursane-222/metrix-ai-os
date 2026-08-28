import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { cancelTaskMock, findTaskByIdMock } = vi.hoisted(() => ({
  cancelTaskMock: vi.fn(),
  findTaskByIdMock: vi.fn(),
}));
vi.mock("@/lib/core/tasks/task.service", () => ({
  cancelTask: cancelTaskMock,
  findTaskById: findTaskByIdMock,
}));

import { taskCancelHandler } from "../task-cancel-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "task.cancel",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["tasks.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("taskCancelHandler", () => {
  beforeEach(() => {
    cancelTaskMock.mockReset();
    findTaskByIdMock.mockReset();
  });

  it("cancels the addressed task through the canonical service", async () => {
    findTaskByIdMock.mockResolvedValue({ id: "t1", status: "OPEN" });
    cancelTaskMock.mockResolvedValue({ id: "t1", status: "CANCELLED" });

    const result = await taskCancelHandler(envelope({ taskId: "t1" }));

    expect(cancelTaskMock).toHaveBeenCalledWith("org-1", "t1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "task", entityId: "t1" } });
  });

  it("reports NO_CHANGE without a second mutation when already cancelled", async () => {
    findTaskByIdMock.mockResolvedValue({ id: "t1", status: "CANCELLED" });

    const result = await taskCancelHandler(envelope({ taskId: "t1" }));

    expect(cancelTaskMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing taskId before mutation", async () => {
    await expect(taskCancelHandler(envelope({}))).rejects.toThrow(/taskId/);
    expect(cancelTaskMock).not.toHaveBeenCalled();
  });
});
