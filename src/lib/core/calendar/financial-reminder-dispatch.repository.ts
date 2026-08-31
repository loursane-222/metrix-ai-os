import { prisma } from "@/lib/core/shared/prisma";
import type { FinancialReminderKind, FinancialReminderSourceType } from "@prisma/client";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";

export type FinancialReminderDispatchKey = {
  organizationId: string;
  sourceType: FinancialReminderSourceType;
  sourceId: string;
  reminderKind: FinancialReminderKind;
  dayBucket: string;
};

export function findFinancialReminderDispatch(key: FinancialReminderDispatchKey) {
  return prisma.financialReminderDispatch.findFirst({
    where: { organizationId: key.organizationId, sourceType: key.sourceType, sourceId: key.sourceId, reminderKind: key.reminderKind, dayBucket: key.dayBucket },
  });
}

/**
 * Replay-safe by construction: the (organizationId, sourceType, sourceId,
 * reminderKind, dayBucket) unique constraint makes a second concurrent
 * scheduler run's insert collide (P2002) rather than create a duplicate
 * dispatch row — caller treats that collision as "someone else already
 * sent it this tick", not an error.
 */
export async function createFinancialReminderDispatch(input: FinancialReminderDispatchKey & { amount: number; currency: string }) {
  try {
    return await prisma.financialReminderDispatch.create({ data: input });
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) return findFinancialReminderDispatch(input);
    throw error;
  }
}
