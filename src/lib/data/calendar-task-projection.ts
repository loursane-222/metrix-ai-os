import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

/**
 * A dated, still-open Task as it appears on the calendar. This is a
 * read-time projection of the canonical Task row — never a stored copy —
 * so it can never be stale: a changed dueAt moves it, a DONE/CANCELLED
 * task disappears, and there is no second record to reconcile. The task
 * stays owned by task_create/task_update; `kind: "TASK"` tells the caller
 * this item is changed with task_update, not calendar_update.
 */
export type TaskCalendarItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: false;
  kind: "TASK";
};

const MAX_TASK_ITEMS = 200;

export async function listTaskCalendarItems(input: {
  actorUserId: string;
  organizationId: string;
  startsBefore?: string;
  endsAfter?: string;
}): Promise<TaskCalendarItem[]> {
  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  // Same inclusive overlap bounds the native calendar read uses: a task
  // is a single instant, so it is in range when endsAfter <= dueAt <=
  // startsBefore.
  const dueAt: { not: null; gte?: Date; lte?: Date } = { not: null };

  if (input.endsAfter) dueAt.gte = new Date(input.endsAfter);
  if (input.startsBefore) dueAt.lte = new Date(input.startsBefore);

  const tasks = await db.task.findMany({
    where: {
      organizationId: input.organizationId,
      status: "OPEN",
      dueAt,
      // The user's own schedule: tasks assigned to them, or unassigned
      // tasks they created.
      OR: [
        { assignedToUserId: input.actorUserId },
        { assignedToUserId: null, createdByUserId: input.actorUserId }
      ]
    },
    orderBy: { dueAt: "asc" },
    take: MAX_TASK_ITEMS,
    select: { id: true, title: true, dueAt: true }
  });

  return tasks.flatMap(task =>
    task.dueAt
      ? [
          {
            id: `task:${task.id}`,
            title: `Görev: ${task.title}`,
            startsAt: task.dueAt.toISOString(),
            endsAt: task.dueAt.toISOString(),
            allDay: false as const,
            kind: "TASK" as const
          }
        ]
      : []
  );
}
