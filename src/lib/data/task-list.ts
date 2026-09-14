import {
  db
} from "../db";

import {
  requireOrganizationAccess
} from "../auth/organization-access";

export type TaskReality = {
  id: string;
  organizationId: string;
  title: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: string | null;
  createdAt: string;
};

const MAX_RESULTS = 20;

export async function listTasksForOrganization(
  input: {
    actorUserId: string;
    organizationId: string;
    status?: "OPEN" | "DONE" | "CANCELLED";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    dueAfter?: string;
    dueBefore?: string;
    titleContains?: string;
    createdByMe?: boolean;
    assignedToMe?: boolean;
  }
): Promise<TaskReality[]> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const titleContains =
    input.titleContains?.trim();

  const dueFilter: {
    gte?: Date;
    lte?: Date;
  } = {};

  if (input.dueAfter) {
    dueFilter.gte = new Date(input.dueAfter);
  }

  if (input.dueBefore) {
    dueFilter.lte = new Date(input.dueBefore);
  }

  const tasks = await db.task.findMany({
    where: {
      organizationId,
      ...(input.status
        ? { status: input.status }
        : {}),
      ...(input.priority
        ? { priority: input.priority }
        : {}),
      ...(dueFilter.gte || dueFilter.lte
        ? { dueAt: dueFilter }
        : {}),
      ...(titleContains
        ? {
            title: {
              contains: titleContains,
              mode: "insensitive"
            }
          }
        : {}),
      ...(input.createdByMe
        ? { createdByUserId: actorUserId }
        : {}),
      ...(input.assignedToMe
        ? { assignedToUserId: actorUserId }
        : {})
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      status: true,
      priority: true,
      dueAt: true,
      createdAt: true
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "asc" }
    ],
    take: MAX_RESULTS
  });

  return tasks.map(task => ({
    id: task.id,
    organizationId: task.organizationId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString()
  }));
}
