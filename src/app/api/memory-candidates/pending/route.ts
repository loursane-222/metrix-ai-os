import { ok } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { listPendingMemoryCandidatesByOrganization } from "@/lib/core/memory-candidates/memory-candidate.service";
import { assertCanReviewMemoryCandidates } from "@/lib/memory/memory-candidate-permissions";

export async function GET(): Promise<Response> {
  try {
    const context = await requireAuthContextFromCookies();
    assertCanReviewMemoryCandidates(context);

    const candidates = await listPendingMemoryCandidatesByOrganization(
      context.organization.id,
    );

    return ok({
      candidates,
      count: candidates.length,
    });
  } catch (error: unknown) {
    return authFail(error);
  }
}
