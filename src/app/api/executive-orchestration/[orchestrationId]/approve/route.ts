import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { resumeOrchestration } from "@/lib/executive-orchestration/executive-orchestration.service";

export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ orchestrationId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { orchestrationId } = await params;
    const orchestration = await resumeOrchestration({ auth, orchestrationId });
    if (!orchestration) return fail("Onaylanacak bir işlem bulunamadı.", 404);
    return ok({ orchestration });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[orchestration_approve] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("Onay işlenemedi.", 500);
  }
}
