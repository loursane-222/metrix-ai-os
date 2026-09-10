import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTasksForOrganization: vi.fn(),
  countTaskSummary: vi.fn(),
  listActiveNotificationRecipientRecords: vi.fn(),
}));

vi.mock("@/lib/core/tasks/task.repository", () => ({
  listTasksForOrganization: mocks.listTasksForOrganization,
  countTaskSummary: mocks.countTaskSummary,
}));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: mocks.listActiveNotificationRecipientRecords,
}));
// buildCalendarTool (same file) pulls in the canonical calendar projection,
// whose own import chain reaches Prisma — mocked out so this file can be
// imported without a real DATABASE_URL, same as every other tool test here.
vi.mock("@/lib/company-intelligence/calendar-projection", () => ({ resolveCanonicalCalendarProjection: vi.fn() }));

const { buildTasksTool } = await import("../calendar-tasks-tools");

const runContext = { organizationId: "org-1", actorId: "user-1" } as never;

async function invoke(status: "OPEN" | "DONE" | "CANCELLED" | null): Promise<{ data: unknown }> {
  const tool = buildTasksTool(runContext) as unknown as { invoke: (ctx: never, input: string) => Promise<unknown> };
  const result = await tool.invoke({ context: runContext } as never, JSON.stringify({ status }));
  return result as { data: unknown };
}

describe("company_tasks — assignee readback must never leak a raw UUID", () => {
  it("resolves each task's assigneeUserId to a real display name via the active-member lookup", async () => {
    mocks.countTaskSummary.mockResolvedValue({ open: 1, overdue: 0, done: 0 });
    mocks.listTasksForOrganization.mockResolvedValue([
      { id: "t-1", title: "Ata", assigneeUserId: "user-42", priority: "HIGH", status: "OPEN" },
    ]);
    mocks.listActiveNotificationRecipientRecords.mockResolvedValue([
      { userId: "user-42", fullName: "Ahmet Yılmaz", role: "OWNER" },
    ]);

    const result = await invoke("OPEN");
    const data = result.data as { tasks: Array<{ id: string; assigneeName: string | null }> };

    expect(data.tasks[0]).toMatchObject({ id: "t-1", assigneeName: "Ahmet Yılmaz" });
  });

  it("falls back to null (never the raw id) when the assignee isn't an active member", async () => {
    mocks.countTaskSummary.mockResolvedValue({ open: 1, overdue: 0, done: 0 });
    mocks.listTasksForOrganization.mockResolvedValue([
      { id: "t-2", title: "Ata", assigneeUserId: "user-ghost", priority: "MEDIUM", status: "OPEN" },
    ]);
    mocks.listActiveNotificationRecipientRecords.mockResolvedValue([]);

    const result = await invoke("OPEN");
    const data = result.data as { tasks: Array<{ id: string; assigneeName: string | null }> };

    expect(data.tasks[0]).toMatchObject({ id: "t-2", assigneeName: null });
  });

  it("leaves unassigned tasks with a null assigneeName", async () => {
    mocks.countTaskSummary.mockResolvedValue({ open: 1, overdue: 0, done: 0 });
    mocks.listTasksForOrganization.mockResolvedValue([
      { id: "t-3", title: "Serbest", assigneeUserId: null, priority: "LOW", status: "OPEN" },
    ]);
    mocks.listActiveNotificationRecipientRecords.mockResolvedValue([{ userId: "user-42", fullName: "Ahmet Yılmaz", role: "OWNER" }]);

    const result = await invoke("OPEN");
    const data = result.data as { tasks: Array<{ id: string; assigneeName: string | null }> };

    expect(data.tasks[0]).toMatchObject({ id: "t-3", assigneeName: null });
  });
});
