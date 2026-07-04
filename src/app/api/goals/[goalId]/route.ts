import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalNumber,
  optionalString,
  optionalStringEnum,
  readJsonObject,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import {
  getSalesGoalByIdForOrganization,
  updateSalesGoalDetails,
} from "@/lib/core/goals/goal.service";
import type { SalesGoalResult } from "@/lib/core/goals/goal.types";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ goalId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { goalId } = await context.params;

    const goal = await getSalesGoalByIdForOrganization(goalId, authContext.organization.id);

    if (!goal) {
      return fail("Goal not found.", 404);
    }

    return ok({ goal: serializeGoal(goal) });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ goalId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { goalId } = await context.params;
    const body = await readJsonObject(request);

    const rawRevenue = optionalNumber(body, "targetRevenueCents");
    const rawCollection = optionalNumber(body, "targetCollectionCents");

    await updateSalesGoalDetails({
      id: goalId,
      organizationId: authContext.organization.id,
      title: optionalString(body, "title"),
      period: optionalStringEnum(body, "period", ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
      targetRevenueCents: rawRevenue !== undefined ? BigInt(Math.round(rawRevenue)) : undefined,
      targetCollectionCents: rawCollection !== undefined ? BigInt(Math.round(rawCollection)) : undefined,
      startsAt: optionalDate(body, "startsAt"),
      endsAt: optionalDate(body, "endsAt"),
      status: optionalStringEnum(body, "status", ["ACTIVE", "COMPLETED", "CANCELLED"]),
    });

    const updated = await getSalesGoalByIdForOrganization(goalId, authContext.organization.id);

    if (!updated) {
      return fail("Goal not found.", 404);
    }

    return ok({ goal: serializeGoal(updated) });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
