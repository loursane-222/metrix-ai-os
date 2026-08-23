import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { findMostRecentAwaitingApproval } from "@/lib/executive-orchestration/executive-orchestration.service";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const orchestration = await findMostRecentAwaitingApproval(auth.organization.id);
    return ok({ orchestration });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[orchestration_pending_approval] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("Bekleyen onaylar getirilemedi.", 500);
  }
}
