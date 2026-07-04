import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveSalesGoalById } from "@/lib/core/goals/goal.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ goalId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { goalId } = await context.params;

    await archiveSalesGoalById(goalId, authContext.organization.id);

    return ok({ archived: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
