import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listApprovalEnvelopes } from "@/lib/executive-lifecycle/approval-decision-service";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ approvals: listApprovalEnvelopes(auth) });
  } catch {
    return fail("Approval requests could not be loaded.", 401);
  }
}
