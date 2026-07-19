import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveSalesGoalById } from "@/lib/core/goals/goal.service";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

export async function POST(
  _request: Request,
  context: { params: Promise<{ goalId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { goalId } = await context.params;
    const security = authorizeLegacyMutation({ authContext, actionName: "goal.archive", requiredPermission: "goals.archive", entityType: "SalesGoal", entityId: goalId });

    await archiveSalesGoalById(goalId, authContext.organization.id);
    security.succeed();

    return ok({ archived: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
