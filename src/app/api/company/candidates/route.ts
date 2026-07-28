import { randomUUID } from "node:crypto";
import { BusinessCandidateOperation, BusinessCandidateSourceChannel } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { persistBusinessPropositions } from "@/lib/business-reality-candidates";
import { listBusinessCandidates } from "@/lib/business-reality-candidates/business-candidate.service";

const ALLOWED_TARGETS = new Set(["CompanyProfile", "CompanyUnit", "CustomFieldDefinition", "CompanyDynamicFieldValue", "SalesGoal"]);

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const candidates = await listBusinessCandidates({ organizationId: auth.organization.id });
    return ok({ candidates: candidates.filter((item) => ALLOWED_TARGETS.has(item.targetDomain) && !["PROMOTED", "REJECTED", "FAILED", "EXPIRED"].includes(item.status)) });
  } catch (error) { return authFail(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const targetDomain = typeof body.targetDomain === "string" ? body.targetDomain : "";
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (!ALLOWED_TARGETS.has(targetDomain) || !changes.length) return fail("targetDomain and changes are invalid.", 400);
    const sourceInputId = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const candidates = await persistBusinessPropositions({
      organizationId: auth.organization.id,
      sourceChannel: body.sourceChannel === "VOICE" ? BusinessCandidateSourceChannel.VOICE : BusinessCandidateSourceChannel.API,
      sourceInputId,
      propositions: [{
        propositionId: randomUUID(),
        propositionType: typeof body.propositionType === "string" ? body.propositionType : "COMPANY_MUTATION",
        targetDomain,
        targetRecordId: typeof body.targetRecordId === "string" ? body.targetRecordId : null,
        entityResolutionStatus: body.targetRecordId ? "RESOLVED" : "NEW_ENTITY",
        operation: typeof body.operation === "string" && body.operation in BusinessCandidateOperation ? BusinessCandidateOperation[body.operation as keyof typeof BusinessCandidateOperation] : BusinessCandidateOperation.UPDATE,
        confidence: 1,
        requiresApproval: true,
        verificationRequired: true,
        provenance: { actorUserId: auth.user.id, channel: body.sourceChannel === "VOICE" ? "voice" : "company_ui", sourceInputId },
        changes: changes.map((change) => {
          if (!change || typeof change !== "object" || Array.isArray(change) || typeof (change as Record<string, unknown>).fieldPath !== "string") throw new Error("INVALID_COMPANY_CANDIDATE_CHANGE");
          return { fieldPath: String((change as Record<string, unknown>).fieldPath), proposedValue: (change as Record<string, unknown>).proposedValue, requiresApproval: true };
        }),
      }],
    });
    return ok({ candidate: candidates[0] }, 201);
  } catch (error) { return authFail(error); }
}
