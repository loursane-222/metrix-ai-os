import { getSalesGoalByIdForOrganization, updateSalesGoalDetails } from "@/lib/core/goals/goal.service";
import type { SalesGoalPeriod, SalesGoalStatus } from "@prisma/client";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const PERIODS = ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const;
const STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined) return undefined;
  const raw = requiredString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid ISO date string.`);
  return date;
}

/**
 * goal.update için Domain Action handler'ı. Mevcut updateSalesGoalDetails
 * service'ini sarar — PATCH /api/goals/[goalId] ile aynı alan kümesi.
 */
export const goalUpdateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { goalId, title, period, targetRevenueCents, targetCollectionCents, startsAt, endsAt, status } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const resolvedGoalId = requiredString(goalId, "goalId");

  if ([title, period, targetRevenueCents, targetCollectionCents, startsAt, endsAt, status].every((value) => value === undefined)) {
    throw new Error("At least one updatable field is required.");
  }
  if (period !== undefined && !(PERIODS as readonly string[]).includes(period as string)) throw new Error("period must be a valid SalesGoalPeriod.");
  if (status !== undefined && !(STATUSES as readonly string[]).includes(status as string)) throw new Error("status must be a valid SalesGoalStatus.");

  const before = await getSalesGoalByIdForOrganization(resolvedGoalId, organizationId);
  if (!before) throw new Error("Goal not found.");

  await updateSalesGoalDetails({
    id: resolvedGoalId,
    organizationId,
    title: typeof title === "string" ? title : undefined,
    period: period as SalesGoalPeriod | undefined,
    targetRevenueCents: typeof targetRevenueCents === "number" ? BigInt(Math.round(targetRevenueCents)) : undefined,
    targetCollectionCents: typeof targetCollectionCents === "number" ? BigInt(Math.round(targetCollectionCents)) : undefined,
    startsAt: optionalDate(startsAt, "startsAt"),
    endsAt: optionalDate(endsAt, "endsAt"),
    status: status as SalesGoalStatus | undefined,
  });

  const updated = await getSalesGoalByIdForOrganization(resolvedGoalId, organizationId);
  if (!updated) throw new Error("Goal not found.");

  const changedFields = [
    ...(typeof title === "string" ? ["title"] : []),
    ...(period !== undefined ? ["period"] : []),
    ...(typeof targetRevenueCents === "number" ? ["targetRevenueCents"] : []),
    ...(typeof targetCollectionCents === "number" ? ["targetCollectionCents"] : []),
    ...(startsAt !== undefined ? ["startsAt"] : []),
    ...(endsAt !== undefined ? ["endsAt"] : []),
    ...(status !== undefined ? ["status"] : []),
  ];

  return {
    status: "SUCCESS",
    entityRef: { entityType: "goal", entityId: resolvedGoalId },
    resultSummary: `goal.update applied to ${changedFields.length} field(s).`,
    metadata: { changedFields },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: {
      goalId: resolvedGoalId,
      ...(typeof title === "string" ? { title: before.title } : {}),
      ...(period !== undefined ? { period: before.period } : {}),
      ...(typeof targetRevenueCents === "number" ? { targetRevenueCents: before.targetRevenueCents !== null ? Number(before.targetRevenueCents) : undefined } : {}),
      ...(typeof targetCollectionCents === "number" ? { targetCollectionCents: before.targetCollectionCents !== null ? Number(before.targetCollectionCents) : undefined } : {}),
      ...(startsAt !== undefined ? { startsAt: before.startsAt?.toISOString() } : {}),
      ...(endsAt !== undefined ? { endsAt: before.endsAt?.toISOString() } : {}),
      ...(status !== undefined ? { status: before.status } : {}),
    },
  };
};
