import { prisma } from "@/lib/core/shared/prisma";
import { listFieldVisits } from "@/lib/core/field-visits/field-visit.service";
import { listPayments } from "@/lib/core/payments/payment.service";
import { currentMonthBounds, findActivePersonMonthlyGoals } from "./rep-goal.repository";

export type RepGoalStatus = Readonly<{
  visitTarget: number | null;
  visitActual: number;
  salesTarget: number | null;
  salesActual: number;
  collectionTarget: number | null;
  collectionActual: number;
}>;

/**
 * Returns null when the rep has no active personal goal at all this month
 * — nothing honest to show progress against. Any of the three targets may
 * be individually absent (a rep can have just a visit target, say).
 *
 * Known simplification: collectionActual only counts payments linked from
 * visits logged THIS month — a payment confirmed this month but linked to
 * a visit logged last month isn't included. Reasonable v1 approximation,
 * matching the same "activity this month" framing as the visit target.
 */
export async function resolveRepGoalAchievement(
  organizationId: string,
  repUserId: string,
  reference: Date = new Date(),
): Promise<RepGoalStatus | null> {
  const goals = await findActivePersonMonthlyGoals({ organizationId, ownerUserId: repUserId, reference });
  if (goals.length === 0) return null;

  const { start, end } = currentMonthBounds(reference);

  const activityGoal = goals.find((goal) => goal.goalType === "ACTIVITY");
  const salesGoal = goals.find((goal) => goal.goalType === "SALES");
  const collectionGoal = goals.find((goal) => goal.goalType === "COLLECTION");

  const visitTarget = activityGoal?.targetValue !== null && activityGoal?.targetValue !== undefined ? Number(activityGoal.targetValue) : null;
  const salesTarget = salesGoal?.targetRevenueCents !== null && salesGoal?.targetRevenueCents !== undefined ? Number(salesGoal.targetRevenueCents) / 100 : null;
  const collectionTarget = collectionGoal?.targetCollectionCents !== null && collectionGoal?.targetCollectionCents !== undefined ? Number(collectionGoal.targetCollectionCents) / 100 : null;

  const visits = await listFieldVisits({ organizationId, repUserId, startAt: start, endAt: end });
  const visitActual = visits.length;

  const wonQuotes = await prisma.quote.findMany({
    where: { organizationId, createdByUserId: repUserId, status: "WON", wonAt: { gte: start, lt: end } },
    select: { amount: true },
  });
  const salesActual = wonQuotes.reduce((sum, quote) => sum + Number(quote.amount ?? 0), 0);

  const linkedPaymentIds = visits.map((visit) => visit.relatedPaymentId).filter((id): id is string => Boolean(id));
  let collectionActual = 0;
  if (linkedPaymentIds.length > 0) {
    const idSet = new Set(linkedPaymentIds);
    const payments = await listPayments(organizationId);
    collectionActual = payments
      .filter((payment) => idSet.has(payment.id) && payment.status === "PAID" && payment.paidAt && payment.paidAt >= start && payment.paidAt < end)
      .reduce((sum, payment) => sum + Number(payment.paidAmount ?? 0), 0);
  }

  return { visitTarget, visitActual, salesTarget, salesActual, collectionTarget, collectionActual };
}
