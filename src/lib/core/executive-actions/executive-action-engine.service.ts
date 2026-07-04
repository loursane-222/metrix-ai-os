import { prisma } from "@/lib/core/shared/prisma";
import type { ExecutiveAction } from "@prisma/client";
import type {
  CancelExecutiveActionInput,
  CompleteExecutiveActionInput,
  CreateExecutiveActionInput,
} from "./executive-action.types";

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING"] as const;

export async function createExecutiveAction(
  input: CreateExecutiveActionInput,
): Promise<ExecutiveAction> {
  const sourceId = input.sourceId ?? null;

  const duplicate = await prisma.executiveAction.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId,
      status: { in: [...ACTIVE_STATUSES] },
    },
  });
  if (duplicate) return duplicate;

  return prisma.executiveAction.create({
    data: {
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId,
      title: input.title,
      reason: input.reason,
      priority: input.priority ?? "MEDIUM",
      ownerType: input.ownerType ?? "UNASSIGNED",
      ownerId: input.ownerId ?? null,
      dueDate: input.dueDate ?? null,
    },
  });
}

export async function listOpenExecutiveActions(
  organizationId: string,
): Promise<ExecutiveAction[]> {
  return prisma.executiveAction.findMany({
    where: {
      organizationId,
      status: { in: [...ACTIVE_STATUSES] },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function markExecutiveActionInProgress(
  id: string,
  organizationId: string,
): Promise<ExecutiveAction | null> {
  const existing = await prisma.executiveAction.findFirst({
    where: { id, organizationId },
  });
  if (!existing) return null;

  return prisma.executiveAction.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
  });
}

export async function completeExecutiveAction(
  input: CompleteExecutiveActionInput,
): Promise<ExecutiveAction | null> {
  const existing = await prisma.executiveAction.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!existing) return null;

  return prisma.executiveAction.update({
    where: { id: input.id },
    data: {
      status: "DONE",
      completedAt: new Date(),
      resultSummary: input.resultSummary ?? null,
      outcomeStatus: input.outcomeStatus ?? "UNKNOWN",
    },
  });
}

export async function listRecentCompletedExecutiveActions(
  organizationId: string,
  sinceDate: Date,
): Promise<ExecutiveAction[]> {
  return prisma.executiveAction.findMany({
    where: {
      organizationId,
      status: "DONE",
      completedAt: { gte: sinceDate },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
  });
}

export async function cancelExecutiveAction(
  input: CancelExecutiveActionInput,
): Promise<ExecutiveAction | null> {
  const existing = await prisma.executiveAction.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!existing) return null;

  return prisma.executiveAction.update({
    where: { id: input.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });
}
