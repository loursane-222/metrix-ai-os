import { Prisma, type SalesGoal } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";

export type RepGoalType = "ACTIVITY" | "SALES" | "COLLECTION";

/**
 * Same UTC calendar-month boundary the existing company-wide goal-
 * achievement engine uses (goal-achievement-analyzer.service.ts) — company
 * and personal numbers should never disagree about where "this month"
 * starts.
 */
export function currentMonthBounds(reference: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return { start, end };
}

function goalTypeAmountField(goalType: RepGoalType, amount: number): Record<string, unknown> {
  if (goalType === "ACTIVITY") return { targetValue: new Prisma.Decimal(amount) };
  const cents = BigInt(Math.round(amount * 100));
  return goalType === "SALES" ? { targetRevenueCents: cents } : { targetCollectionCents: cents };
}

/**
 * Finds this rep's ACTIVE PERSON-scoped MONTHLY goal of the given type for
 * the current month and updates its target, or creates one — repeating the
 * same "hedef koy" for the same rep/type/month updates rather than
 * duplicating (mirrors the intent behind company.goal.upsert's naming,
 * without reusing that action — it's tied to the memory-candidate approval
 * flow and doesn't set ownerUserId at all).
 */
export async function upsertPersonMonthlyGoal(input: {
  organizationId: string;
  ownerUserId: string;
  goalType: RepGoalType;
  title: string;
  amount: number;
  reference?: Date;
}): Promise<SalesGoal> {
  const { start, end } = currentMonthBounds(input.reference ?? new Date());
  const amountFields = goalTypeAmountField(input.goalType, input.amount);

  const existing = await prisma.salesGoal.findFirst({
    where: {
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      scope: "PERSON",
      period: "MONTHLY",
      goalType: input.goalType,
      status: "ACTIVE",
      startsAt: start,
    },
  });

  if (existing) {
    return prisma.salesGoal.update({ where: { id: existing.id, organizationId: input.organizationId }, data: { title: input.title, ...amountFields } });
  }

  return prisma.salesGoal.create({
    data: {
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      scope: "PERSON",
      period: "MONTHLY",
      goalType: input.goalType,
      title: input.title,
      status: "ACTIVE",
      startsAt: start,
      endsAt: end,
      currency: "TRY",
      ...amountFields,
    },
  });
}

export function findActivePersonMonthlyGoals(input: { organizationId: string; ownerUserId: string; reference?: Date }): Promise<SalesGoal[]> {
  const { start } = currentMonthBounds(input.reference ?? new Date());
  return prisma.salesGoal.findMany({
    where: {
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      scope: "PERSON",
      period: "MONTHLY",
      status: "ACTIVE",
      startsAt: start,
    },
  });
}

/**
 * Every distinct rep with at least one active PERSON MONTHLY goal this
 * month — the team-wide goal view aggregates across exactly this set (reps
 * with no goal set contribute nothing to a target-vs-actual view).
 */
export async function listDistinctPersonGoalOwners(input: { organizationId: string; reference?: Date }): Promise<string[]> {
  const { start } = currentMonthBounds(input.reference ?? new Date());
  const rows = await prisma.salesGoal.findMany({
    where: {
      organizationId: input.organizationId,
      scope: "PERSON",
      period: "MONTHLY",
      status: "ACTIVE",
      startsAt: start,
      ownerUserId: { not: null },
    },
    select: { ownerUserId: true },
    distinct: ["ownerUserId"],
  });
  return rows.map((row) => row.ownerUserId).filter((id): id is string => Boolean(id));
}
