import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalNumber,
  optionalString,
  optionalStringEnum,
  readJsonObject,
  requiredString,
  requiredStringEnum,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewSalesGoal, listSalesGoals } from "@/lib/core/goals/goal.service";
import type { SalesGoalResult } from "@/lib/core/goals/goal.types";
import type { SalesGoalPeriod, SalesGoalStatus } from "@prisma/client";

const GOAL_PERIODS = ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const satisfies readonly SalesGoalPeriod[];
const GOAL_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const satisfies readonly SalesGoalStatus[];

function serializeGoal(goal: SalesGoalResult) {
  return {
    ...goal,
    targetRevenueCents: goal.targetRevenueCents?.toString() ?? null,
    targetCollectionCents: goal.targetCollectionCents?.toString() ?? null,
  };
}

function optionalDate(body: Record<string, unknown>, key: string): Date | undefined {
  const value = optionalString(body, key);

  if (value === undefined) return undefined;

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    throw new ApiValidationError(`${key} must be a valid ISO date string.`);
  }

  return date;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get("period") ?? undefined;
    const rawStatus = searchParams.get("status") ?? undefined;

    if (rawPeriod !== undefined && !(GOAL_PERIODS as readonly string[]).includes(rawPeriod)) {
      return fail("period is invalid.", 400);
    }

    if (rawStatus !== undefined && !(GOAL_STATUSES as readonly string[]).includes(rawStatus)) {
      return fail("status is invalid.", 400);
    }

    const goals = await listSalesGoals({
      organizationId: authContext.organization.id,
      period: rawPeriod as SalesGoalPeriod | undefined,
      status: rawStatus as SalesGoalStatus | undefined,
    });

    return ok({ goals: goals.map(serializeGoal), count: goals.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);

    const rawRevenue = optionalNumber(body, "targetRevenueCents");
    const rawCollection = optionalNumber(body, "targetCollectionCents");

    const goal = await createNewSalesGoal({
      organizationId: authContext.organization.id,
      title: requiredString(body, "title"),
      period: requiredStringEnum(body, "period", GOAL_PERIODS),
      targetRevenueCents: rawRevenue !== undefined ? BigInt(Math.round(rawRevenue)) : undefined,
      targetCollectionCents: rawCollection !== undefined ? BigInt(Math.round(rawCollection)) : undefined,
      startsAt: optionalDate(body, "startsAt"),
      endsAt: optionalDate(body, "endsAt"),
    });

    return ok({ goal: serializeGoal(goal) }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
