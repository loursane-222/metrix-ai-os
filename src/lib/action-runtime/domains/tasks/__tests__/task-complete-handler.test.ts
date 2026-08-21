import { describe, expect, it, vi, beforeEach } from "vitest";

const { completeTaskMock, notifyMock } = vi.hoisted(() => ({
  completeTaskMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("@/lib/core/tasks/task.service", () => ({ completeTask: completeTaskMock }));
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: notifyMock }));

import { taskCompleteHandler } from "../task-complete-handler";
import { auditStore } from "../../../audit";

const envelope = (taskId: string) => ({
  executionId: "exec-1",
  actionName: "task.complete",
  input: { taskId },
  entityRef: { entityType: "task", entityId: taskId },
  executionContext: { actorId: "assignee-1", organizationId: "org-1", role: "EMPLOYEE", permissions: ["tasks.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("taskCompleteHandler proactive completion notification", () => {
  beforeEach(() => {
    completeTaskMock.mockReset();
    notifyMock.mockReset();
  });

  it("notifies the task's creator (the delegating manager) when the assignee completes it", async () => {
    completeTaskMock.mockResolvedValue({ id: "t-1", title: "Teklifi gönder", createdByUserId: "manager-1", assigneeUserId: "assignee-1" });
    notifyMock.mockResolvedValue({ notifications: [{ id: "n-1" }], additionalTargetResolutions: [] });

    const result = await taskCompleteHandler(envelope("t-1"));

    expect(result.status).toBe("SUCCESS");
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      recipientUserId: "manager-1",
      type: "task.completed",
      entityType: "Task",
      entityId: "t-1",
    }));
  });

  it("still fans out to leadership (recipientUserId undefined) when the task has no creator on record", async () => {
    completeTaskMock.mockResolvedValue({ id: "t-2", title: "Self-assigned iş", createdByUserId: null, assigneeUserId: "assignee-1" });
    notifyMock.mockResolvedValue({ notifications: [], additionalTargetResolutions: [] });

    await taskCompleteHandler(envelope("t-2"));

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: undefined }));
  });

  it("reports SUCCESS and audits the failure instead of throwing when the notification channel fails (task is already completed)", async () => {
    completeTaskMock.mockResolvedValue({ id: "t-3", title: "Raporu bitir", createdByUserId: "manager-1", assigneeUserId: "assignee-1" });
    notifyMock.mockRejectedValue(new Error("notification channel unavailable"));

    const result = await taskCompleteHandler(envelope("t-3"));

    expect(result.status).toBe("SUCCESS");
    expect(result.metadata).toMatchObject({ taskId: "t-3", notificationDelivered: false });
    const audited = auditStore.listByEntity("org-1", { entityType: "task", entityId: "t-3" });
    expect(audited.some((record) => record.reasonCode === "NOTIFICATION_SIDE_EFFECT_FAILED" && record.outcome === "FAILED")).toBe(true);
  });

  it("returns FAILURE without notifying when the task does not exist in this organization", async () => {
    completeTaskMock.mockResolvedValue(null);

    const result = await taskCompleteHandler(envelope("t-missing"));

    expect(result.status).toBe("FAILURE");
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
