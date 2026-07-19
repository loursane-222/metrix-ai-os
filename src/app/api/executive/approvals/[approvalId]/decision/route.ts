import { ok, fail } from "@/lib/api/response";
import { ApiValidationError, optionalString, readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { decideApproval } from "@/lib/executive-lifecycle/approval-decision-service";

export async function POST(request: Request, context: { params: Promise<{ approvalId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { approvalId } = await context.params;
    const body = await readJsonObject(request);
    const decision = requiredString(body, "decision");
    if (decision !== "approve" && decision !== "reject") throw new ApiValidationError("decision must be approve or reject.");
    const envelope = decideApproval(auth, { approvalId, decision, reason: optionalString(body, "reason") });
    return ok({ envelope });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Approval decision failed.", 500);
  }
}
