import { prisma } from "@/lib/core/shared/prisma";
import type {
  CollectionActionStatus,
  CollectionActionType,
  CreateCollectionActionInput,
  UpdateCollectionActionStatusInput,
} from "./collection-action.types";
import type { LifecycleUpdateInput } from "./collection-action-lifecycle.types";

const ACTIVE_STATUSES: CollectionActionStatus[] = ["OPEN", "IN_PROGRESS"];

export async function createCollectionAction(input: CreateCollectionActionInput) {
  return prisma.collectionAction.create({
    data: {
      organizationId: input.organizationId,
      paymentId: input.paymentId,
      title: input.title,
      description: input.description ?? null,
      actionType: input.actionType,
      source: input.source ?? "AI_SUGGESTED",
      priority: input.priority ?? 0,
      aiReason: input.aiReason ?? null,
      dueDate: input.dueDate ?? null,
    },
  });
}

export async function findOpenActionByPaymentAndType(
  paymentId: string,
  actionType: CollectionActionType,
): Promise<{ id: string } | null> {
  return prisma.collectionAction.findFirst({
    where: {
      paymentId,
      actionType,
      status: { in: ACTIVE_STATUSES },
    },
    select: { id: true },
  });
}

export async function listActiveCollectionActionsForOrganization(
  organizationId: string,
): Promise<ActiveCollectionActionRow[]> {
  return prisma.collectionAction.findMany({
    where: {
      organizationId,
      status: { in: ACTIVE_STATUSES },
    },
    select: {
      id: true,
      actionType: true,
      status: true,
      title: true,
      aiReason: true,
      priority: true,
      createdAt: true,
      payment: {
        select: {
          title: true,
          person: { select: { fullName: true } },
        },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 20,
  });
}

export async function updateCollectionActionStatus(
  input: UpdateCollectionActionStatusInput,
): Promise<void> {
  const now = new Date();
  await prisma.collectionAction.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      status: input.status,
      notes: input.notes ?? undefined,
      completedAt: input.status === "DONE" ? now : undefined,
      dismissedAt: input.status === "DISMISSED" ? now : undefined,
    },
  });
}

export async function updateCollectionActionLifecycle(
  input: LifecycleUpdateInput,
): Promise<void> {
  const now = new Date();
  await prisma.collectionAction.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.expectedPaymentDate !== undefined ? { expectedPaymentDate: input.expectedPaymentDate } : {}),
      ...(input.lastContactAt !== undefined ? { lastContactAt: input.lastContactAt } : {}),
      ...(input.status === "DONE" ? { completedAt: now } : {}),
      ...(input.status === "DISMISSED" ? { dismissedAt: now } : {}),
    },
  });
}

export type ActiveCollectionActionRow = {
  id: string;
  actionType: CollectionActionType;
  status: CollectionActionStatus;
  title: string;
  aiReason: string | null;
  priority: number;
  createdAt: Date;
  payment: {
    title: string;
    person: { fullName: string } | null;
  };
};
