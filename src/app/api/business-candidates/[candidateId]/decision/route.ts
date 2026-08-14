import { BusinessCandidateStatus } from "@prisma/client";

import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import {
  createBusinessCandidateActionRuntimeExecutor,
  decideBusinessCandidateChanges,
  getBusinessCandidate,
  promoteBusinessCandidate,
} from "@/lib/business-reality-candidates";
import { appendExecutiveRuntimeCandidateTrace } from "@/lib/ai/executive-runtime-trace/executive-runtime-trace-persistence.service";

export async function POST(
  request: Request,
  context: { params: Promise<{ candidateId: string }> },
): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { candidateId } = await context.params;
    const body = await readJsonObject(request);
    const current = await getBusinessCandidate({
      organizationId: auth.organization.id,
      candidateId,
    });
    if (!current) return fail("Business candidate not found.", 404);

    const approvedChangeIds = booleanValue(body.approveAll)
      ? current.changes.map((change) => change.id)
      : stringArray(body.approvedChangeIds, "approvedChangeIds");
    const rejectedChangeIds = booleanValue(body.rejectAll)
      ? current.changes.map((change) => change.id)
      : stringArray(body.rejectedChangeIds, "rejectedChangeIds");
    if (approvedChangeIds.length + rejectedChangeIds.length === 0) {
      throw new ApiValidationError("At least one change decision is required.");
    }

    const candidate = await decideBusinessCandidateChanges({
      organizationId: auth.organization.id,
      candidateId,
      actorUserId: auth.user.id,
      approvedChangeIds,
      rejectedChangeIds,
      reason: optionalString(body, "reason"),
    });

    let receipt = null;
    if (
      candidate.status === BusinessCandidateStatus.APPROVED
      || candidate.status === BusinessCandidateStatus.PARTIALLY_APPROVED
    ) {
      receipt = await promoteBusinessCandidate({
        organizationId: auth.organization.id,
        candidateId,
        actorUserId: auth.user.id,
        execute: createBusinessCandidateActionRuntimeExecutor(auth),
      });
    }
    const updated = await getBusinessCandidate({
      organizationId: auth.organization.id,
      candidateId,
    });
    const requestId = provenanceRequestId(updated?.provenanceJson);
    if (updated && requestId) {
      await appendExecutiveRuntimeCandidateTrace({
        organizationId: auth.organization.id,
        requestId,
        candidates: [updated],
        blockedAiGeneratedCount: 0,
      }).catch((traceError) => { console.error("[business_candidate_decision] failed to append executive runtime trace", { errorName: traceError instanceof Error ? traceError.name : "UnknownError", errorMessage: traceError instanceof Error ? traceError.message : "Unknown error" }); });
    }
    return ok({ candidate: updated ?? candidate, receipt });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    if (error instanceof AuthError) return fail(error.message, error.status);
    return candidateFailure(error);
  }
}

function provenanceRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const requestId = (value as Record<string, unknown>).requestId;
  return typeof requestId === "string" && requestId ? requestId : null;
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ApiValidationError(`${field} must be an array of non-empty strings.`);
  }
  return value.map((item) => String(item));
}

function booleanValue(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new ApiValidationError("approveAll/rejectAll must be boolean.");
  return value;
}

function candidateFailure(error: unknown): Response {
  const code = error instanceof Error ? error.message : "BUSINESS_CANDIDATE_DECISION_FAILED";
  if (code.includes("NOT_FOUND")) return fail("Business candidate not found.", 404);
  if (
    code.includes("SCOPE")
    || code.includes("UNRESOLVED")
    || code.includes("VERIFICATION")
    || code.includes("CONFLICT")
  ) {
    return fail(code, 409);
  }
  return fail("Business candidate decision failed.", 500);
}
