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

// listTasksForOrganization caps at 100 rows — the real total, unbounded
// by that cap, for callers that need to display "how many total" rather
// than "how many loaded".
export async function countTasksForOrganization(input: ListTasksInput): Promise<number> {
  return prisma.task.count({ where: { organizationId: input.organizationId, status: input.status } });
}

export async function findTaskById(taskId: string, organizationId: string): Promise<TaskResult | null> {
  return prisma.task.findFirst({ where: { id: taskId, organizationId } });
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

export async function completeTaskRecord(organizationId: string, taskId: string): Promise<TaskResult | null> {
  const existing = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
  if (!existing) return null;
  if (existing.status === "DONE") return existing;
  return prisma.task.update({ where: { id: taskId, organizationId }, data: { status: "DONE" } });
}

export async function cancelTaskRecord(organizationId: string, taskId: string): Promise<TaskResult | null> {
  const existing = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
  if (!existing) return null;
  if (existing.status === "CANCELLED") return existing;
  return prisma.task.update({ where: { id: taskId, organizationId }, data: { status: "CANCELLED" } });
}
