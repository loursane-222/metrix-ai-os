import type { ActionExecutionEnvelope, ActionHandlerRegistry, HandlerResult } from "../../execution";
import { updateCompanyProfile } from "@/lib/company/company.service";

export function registerCompanyActions(registry: ActionHandlerRegistry): void {
  registry.registerHandler("company.profile.update", handleCompanyProfileUpdate);
}

async function handleCompanyProfileUpdate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const candidateId = String(envelope.input.candidateId ?? "");
  const patch = envelope.input.patch;
  if (!candidateId || !patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Invalid approved Company Candidate.");
  const profile = await updateCompanyProfile(
    envelope.executionContext.organizationId,
    envelope.executionContext.actorId,
    patch as Record<string, unknown>,
    true,
  );
  return {
    status: "SUCCESS",
    entityRef: { entityType: "company_profile", entityId: profile.id },
    resultSummary: "Approved Company Candidate promoted to canonical Company Profile.",
    metadata: { candidateId },
    domainEvents: [{
      eventType: "CompanyProfileUpdated",
      aggregateType: "CompanyProfile",
      aggregateId: profile.id,
      payload: { candidateId },
      schemaVersion: "1.0",
      deduplicationKey: `company-profile:${profile.id}:candidate:${candidateId}`,
    }],
    sideEffects: [],
  };
}
