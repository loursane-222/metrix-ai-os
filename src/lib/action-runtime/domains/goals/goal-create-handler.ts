import { createNewSalesGoal } from "@/lib/core/goals/goal.service";
import type { SalesGoalPeriod } from "@prisma/client";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

const PERIODS = ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined) return undefined;
  const raw = requiredString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid ISO date string.`);
  return date;
}

/**
 * goal.create için Domain Action handler'ı. Mevcut createNewSalesGoal
 * service'ini sarar — Prisma'yı doğrudan çağırmaz. HTTP POST /api/goals ile
 * aynı zorunlu alanları (title, period) taşır; scope/goalType belirtilmezse
 * service'in kendi varsayılanı yoktur — burada route'takiyle aynı
 * varsayılanlar (COMPANY/SALES) uygulanır.
 */
export const goalCreateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { title, period, scope, goalType, targetRevenueCents, targetCollectionCents, targetValue, currency, startsAt, endsAt } = envelope.input;
  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const resolvedTitle = requiredString(title, "title");
  const resolvedPeriod = requiredString(period, "period");
  if (!(PERIODS as readonly string[]).includes(resolvedPeriod)) throw new Error("period must be a valid SalesGoalPeriod.");

  const goal = await createNewSalesGoal({
    organizationId,
    title: resolvedTitle,
    period: resolvedPeriod as SalesGoalPeriod,
    targetRevenueCents: optionalNumber(targetRevenueCents) !== undefined ? BigInt(Math.round(optionalNumber(targetRevenueCents)!)) : undefined,
    targetCollectionCents: optionalNumber(targetCollectionCents) !== undefined ? BigInt(Math.round(optionalNumber(targetCollectionCents)!)) : undefined,
    targetValue: optionalNumber(targetValue),
    currency: optionalString(currency),
    startsAt: optionalDate(startsAt, "startsAt"),
    endsAt: optionalDate(endsAt, "endsAt"),
    scope: optionalString(scope) ?? "COMPANY",
    goalType: optionalString(goalType) ?? "SALES",
    provenanceJson: { actorUserId: actorId, source: "SEMANTIC_AUTHORITY" },
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "goal", entityId: goal.id },
    resultSummary: "goal.create completed.",
    metadata: { title: goal.title, period: goal.period },
    domainEvents: [],
    sideEffects: [],
  };
};
