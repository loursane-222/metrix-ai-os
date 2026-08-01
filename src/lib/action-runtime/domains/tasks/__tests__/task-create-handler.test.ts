import { describe, expect, it, vi, beforeEach } from "vitest";

const { createNewTaskMock, notifyMock, createApprovedMemoryItemMock } = vi.hoisted(() => ({
  createNewTaskMock: vi.fn(),
  notifyMock: vi.fn(),
  createApprovedMemoryItemMock: vi.fn(),
}));

vi.mock("@/lib/core/tasks/task.service", () => ({ createNewTask: createNewTaskMock }));
vi.mock("@/lib/core/notifications", () => ({ notify: notifyMock }));
vi.mock("@/lib/core/memory-items/memory-item.service", () => ({ createApprovedMemoryItem: createApprovedMemoryItemMock }));

import { taskCreateHandler } from "../task-create-handler";
import { auditStore } from "../../../audit";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "task.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["tasks.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("taskCreateHandler side-effect consistency", () => {
  beforeEach(() => {
    createNewTaskMock.mockReset();
    notifyMock.mockReset();
    createApprovedMemoryItemMock.mockReset();
  });

  it("reports SUCCESS and records the Task even when notification delivery fails", async () => {
    createNewTaskMock.mockResolvedValue({ id: "t-notif-fail", title: "Teklifi gönder", priority: "MEDIUM", assigneeUserId: null });
    notifyMock.mockRejectedValue(new Error("notification channel unavailable"));
    createApprovedMemoryItemMock.mockResolvedValue({ id: "m-1" });

    const result = await taskCreateHandler(envelope({ title: "Teklifi gönder" }));

    expect(result.status).toBe("SUCCESS");
    expect(result.metadata).toMatchObject({ taskId: "t-notif-fail", notificationDelivered: false, memoryRecorded: true });
    const audited = auditStore.listByEntity("org-1", { entityType: "task", entityId: "t-notif-fail" });
    expect(audited.some((record) => record.reasonCode === "NOTIFICATION_SIDE_EFFECT_FAILED" && record.outcome === "FAILED")).toBe(true);
  });

  it("reports SUCCESS and does not tell the user it failed when Executive Memory write fails", async () => {
    createNewTaskMock.mockResolvedValue({ id: "t-memory-fail", title: "Raporu bitir", priority: "LOW", assigneeUserId: null });
    notifyMock.mockResolvedValue({ id: "n-1" });
    createApprovedMemoryItemMock.mockRejectedValue(new Error("Knowledge Authority rejected direct MemoryItem ownership"));

    const result = await taskCreateHandler(envelope({ title: "Raporu bitir" }));

    expect(result.status).toBe("SUCCESS");
    expect(result.metadata).toMatchObject({ taskId: "t-memory-fail", notificationDelivered: true, memoryRecorded: false });
    const audited = auditStore.listByEntity("org-1", { entityType: "task", entityId: "t-memory-fail" });
    expect(audited.some((record) => record.reasonCode === "MEMORY_SIDE_EFFECT_FAILED" && record.outcome === "FAILED")).toBe(true);
  });

  it("fails the whole action when the canonical Task write itself fails (critical side effect)", async () => {
    createNewTaskMock.mockRejectedValue(new Error("db unavailable"));

    await expect(taskCreateHandler(envelope({ title: "Bu görev hiç yazılmayacak" }))).rejects.toThrow("db unavailable");
    expect(notifyMock).not.toHaveBeenCalled();
    expect(createApprovedMemoryItemMock).not.toHaveBeenCalled();
  });

  it("reports both side effects delivered when nothing fails", async () => {
    createNewTaskMock.mockResolvedValue({ id: "t-ok", title: "Hepsi başarılı", priority: "LOW", assigneeUserId: null });
    notifyMock.mockResolvedValue({ id: "n-2" });
    createApprovedMemoryItemMock.mockResolvedValue({ id: "m-2" });

    const result = await taskCreateHandler(envelope({ title: "Hepsi başarılı" }));

    expect(result.metadata).toMatchObject({ notificationDelivered: true, memoryRecorded: true });
  });
});
