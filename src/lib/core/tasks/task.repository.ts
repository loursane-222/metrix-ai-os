import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateTaskInput, ListTasksInput, TaskResult } from "./task.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createTask(
  input: CreateTaskInput,
  tx?: PrismaTransactionClient,
): Promise<TaskResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.task.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      priority: input.priority ?? "MEDIUM",
      assigneeUserId: input.assigneeUserId,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function listTasksForOrganization(input: ListTasksInput): Promise<TaskResult[]> {
  return prisma.task.findMany({
    where: { organizationId: input.organizationId, status: input.status },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function countTaskSummary(organizationId: string) {
  const now = new Date();
  const [openCount, overdueCount, doneCount] = await Promise.all([
    prisma.task.count({ where: { organizationId, status: "OPEN" } }),
    prisma.task.count({ where: { organizationId, status: "OPEN", dueDate: { lt: now } } }),
    prisma.task.count({ where: { organizationId, status: "DONE" } }),
  ]);
  return { openCount, overdueCount, doneCount };
}
