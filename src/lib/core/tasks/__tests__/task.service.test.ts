import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiValidationError } from "@/lib/api/validation";

const { createTaskMock, listTasksForOrganizationMock, countTaskSummaryMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn(),
  listTasksForOrganizationMock: vi.fn(),
  countTaskSummaryMock: vi.fn(),
}));

vi.mock("../task.repository", () => ({
  createTask: createTaskMock,
  listTasksForOrganization: listTasksForOrganizationMock,
  countTaskSummary: countTaskSummaryMock,
}));

import { createNewTask, getTaskSummary, listTasks } from "../task.service";

describe("createNewTask", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    listTasksForOrganizationMock.mockReset();
    countTaskSummaryMock.mockReset();
  });

  it("rejects a task missing a title", async () => {
    await expect(createNewTask({ organizationId: "org-1", title: "" })).rejects.toThrow(ApiValidationError);
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("creates a task when required fields are present", async () => {
    createTaskMock.mockResolvedValue({ id: "t-1", title: "Teklifi gönder" });

    const result = await createNewTask({ organizationId: "org-1", title: "Teklifi gönder" });

    expect(result.id).toBe("t-1");
    expect(createTaskMock).toHaveBeenCalledWith({ organizationId: "org-1", title: "Teklifi gönder" });
  });

  it("lists tasks for an organization", async () => {
    listTasksForOrganizationMock.mockResolvedValue([{ id: "t-1" }]);

    const result = await listTasks({ organizationId: "org-1" });

    expect(result).toHaveLength(1);
    expect(listTasksForOrganizationMock).toHaveBeenCalledWith({ organizationId: "org-1" });
  });

  it("returns the task summary for reporting", async () => {
    countTaskSummaryMock.mockResolvedValue({ openCount: 2, overdueCount: 1, doneCount: 5 });

    await expect(getTaskSummary("org-1")).resolves.toEqual({ openCount: 2, overdueCount: 1, doneCount: 5 });
  });
});
