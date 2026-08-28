import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma } from "@prisma/client";
import type { CreateFieldVisitInput, FieldVisitResult, ListFieldVisitsInput } from "./field-visit.types";

export function createFieldVisit(input: CreateFieldVisitInput, tx: Prisma.TransactionClient = prisma): Promise<FieldVisitResult> {
  return tx.fieldVisit.create({
    data: {
      organizationId: input.organizationId,
      repUserId: input.repUserId,
      customerId: input.customerId ?? null,
      customerNameRaw: input.customerNameRaw,
      contactNameRaw: input.contactNameRaw ?? null,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      notes: input.notes ?? null,
      requestTypesJson: input.requestTypes && input.requestTypes.length > 0 ? (input.requestTypes as unknown as Prisma.InputJsonValue) : undefined,
      unresolvedIntent: input.unresolvedIntent ?? null,
      relatedOrderId: input.relatedOrderId ?? null,
      relatedPaymentId: input.relatedPaymentId ?? null,
    },
  });
}

export function linkFieldVisitOutcome(
  id: string,
  organizationId: string,
  outcome: { relatedOrderId?: string; relatedPaymentId?: string },
  tx: Prisma.TransactionClient = prisma,
): Promise<Prisma.BatchPayload> {
  return tx.fieldVisit.updateMany({
    where: { id, organizationId },
    data: outcome,
  });
}

// startAt-bounded — a visit is attributed to the week it happened in, not
// the week it was logged in (a rep may log yesterday's visit today).
export function listFieldVisitsForOrganization(input: ListFieldVisitsInput): Promise<FieldVisitResult[]> {
  return prisma.fieldVisit.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.repUserId ? { repUserId: input.repUserId } : {}),
      startAt: { gte: input.startAt, lt: input.endAt },
    },
    orderBy: { startAt: "asc" },
  });
}
