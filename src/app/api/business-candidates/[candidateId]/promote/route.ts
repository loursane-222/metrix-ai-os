import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import {
  createBusinessCandidateActionRuntimeExecutor,
  getBusinessCandidate,
  promoteBusinessCandidate,
} from "@/lib/business-reality-candidates";
import { appendExecutiveRuntimeCandidateTrace } from "@/lib/ai/executive-runtime-trace/executive-runtime-trace-persistence.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ candidateId: string }> },
): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { candidateId } = await context.params;
    const receipt = await promoteBusinessCandidate({
      organizationId: auth.organization.id,
      candidateId,
      actorUserId: auth.user.id,
      execute: createBusinessCandidateActionRuntimeExecutor(auth),
    });
    const candidate = await getBusinessCandidate({
      organizationId: auth.organization.id,
      candidateId,
    });
    const requestId = provenanceRequestId(candidate?.provenanceJson);
    if (candidate && requestId) {
      await appendExecutiveRuntimeCandidateTrace({
        organizationId: auth.organization.id,
        requestId,
        candidates: [candidate],
        blockedAiGeneratedCount: 0,
      }).catch((traceError) => { console.error("[business_candidate_promote] failed to append executive runtime trace", { errorName: traceError instanceof Error ? traceError.name : "UnknownError", errorMessage: traceError instanceof Error ? traceError.message : "Unknown error" }); });
    }
    return ok({ receipt, candidate });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const code = error instanceof Error ? error.message : "BUSINESS_CANDIDATE_PROMOTION_FAILED";
    if (code.includes("NOT_FOUND")) return fail("Business candidate not found.", 404);
    if (
      code.includes("SCOPE")
      || code.includes("UNRESOLVED")
      || code.includes("VERIFICATION")
      || code.includes("CONFLICT")
      || code.includes("NO_APPROVED")
    ) {
      return fail(code, 409);
    }
    return fail("Business candidate promotion failed.", 500);
  }
}

function provenanceRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const requestId = (value as Record<string, unknown>).requestId;
  return typeof requestId === "string" && requestId ? requestId : null;
}
