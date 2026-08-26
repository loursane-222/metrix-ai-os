import type { ActionExecutionEnvelope, ActionHandlerRegistry, HandlerResult } from "../../execution";
import { updateCompanyProfile } from "@/lib/company/company.service";
import { createCompanyUnit, setCompanyUnitActive, updateCompanyUnit } from "@/lib/company/company.service";
import { createApprovedCustomFieldDefinition, deprecateCustomerCustomField } from "@/lib/field-authority/custom-field.service";
import { prisma } from "@/lib/core/shared/prisma";
import { Prisma } from "@prisma/client";

export function registerCompanyActions(registry: ActionHandlerRegistry): void {
  registry.registerHandler("company.profile.update", handleCompanyProfileUpdate);
  registry.registerHandler("company.unit.create", handleCompanyUnitCreate);
  registry.registerHandler("company.unit.update", handleCompanyUnitUpdate);
  registry.registerHandler("company.unit.archive", handleCompanyUnitArchive);
  registry.registerHandler("company.field_definition.create", handleCompanyFieldDefinitionCreate);
  registry.registerHandler("company.field_definition.deprecate", handleCompanyFieldDefinitionDeprecate);
  registry.registerHandler("company.field_value.write", handleCompanyFieldValueWrite);
  registry.registerHandler("company.goal.upsert", handleCompanyGoalUpsert);
}

function values(envelope: ActionExecutionEnvelope) {
  const value = envelope.input.values;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid approved Company Candidate values.");
  return value as Record<string, unknown>;
}
function success(envelope: ActionExecutionEnvelope, type: string, id: string, candidateId: string): HandlerResult {
  return { status: "SUCCESS", entityRef: { entityType: type, entityId: id }, resultSummary: `Approved Company Candidate promoted to ${type}.`, metadata: { candidateId }, domainEvents: [{ eventType: `${type}Changed`, aggregateType: type, aggregateId: id, payload: { candidateId }, schemaVersion: "1.0", deduplicationKey: `${type}:${id}:candidate:${candidateId}` }], sideEffects: [] };
}
async function handleCompanyUnitCreate(envelope: ActionExecutionEnvelope) { const candidateId = String(envelope.input.candidateId); const row = await createCompanyUnit(envelope.executionContext.organizationId, values(envelope)); return success(envelope, "CompanyUnit", row.id, candidateId); }
async function handleCompanyUnitUpdate(envelope: ActionExecutionEnvelope) { const candidateId = String(envelope.input.candidateId); const id = String(envelope.input.targetRecordId ?? ""); const row = await updateCompanyUnit(envelope.executionContext.organizationId, id, values(envelope)); return success(envelope, "CompanyUnit", row.id, candidateId); }
// company.unit.create's compensator — deactivates rather than deletes,
// mirroring every other domain's CREATE→archive pair. companyUnitId (not
// candidateId/values) is its own, dedicated id-only input shape, unlike the
// candidate-promotion actions above.
async function handleCompanyUnitArchive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const companyUnitId = envelope.input.companyUnitId;
  if (typeof companyUnitId !== "string" || !companyUnitId.trim()) throw new Error("companyUnitId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await prisma.companyUnit.findFirst({ where: { id: companyUnitId, organizationId } });
  if (!existing) throw new Error("Company unit not found.");
  if (!existing.active) {
    return { status: "SUCCESS", entityRef: { entityType: "CompanyUnit", entityId: companyUnitId }, resultOutcome: "NO_CHANGE", metadata: { companyUnitId }, domainEvents: [], sideEffects: [] };
  }
  await setCompanyUnitActive(organizationId, companyUnitId, false);
  return { status: "SUCCESS", entityRef: { entityType: "CompanyUnit", entityId: companyUnitId }, resultSummary: "company.unit.archive completed.", metadata: { companyUnitId }, domainEvents: [], sideEffects: [] };
}
async function handleCompanyFieldDefinitionCreate(envelope: ActionExecutionEnvelope) { const candidateId = String(envelope.input.candidateId); const row = await createApprovedCustomFieldDefinition({ ...values(envelope), module: "company", entityType: "company", organizationId: envelope.executionContext.organizationId, actorId: envelope.executionContext.actorId } as Parameters<typeof createApprovedCustomFieldDefinition>[0]); return success(envelope, "CustomFieldDefinition", row.id, candidateId); }
// company.field_definition.create's compensator. deprecateCustomerCustomField
// is misleadingly named but module-agnostic — its where clause has no
// module filter, so it works for any domain's CustomFieldDefinition.
async function handleCompanyFieldDefinitionDeprecate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const definitionId = envelope.input.definitionId;
  if (typeof definitionId !== "string" || !definitionId.trim()) throw new Error("definitionId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await prisma.customFieldDefinition.findFirst({ where: { id: definitionId, organizationId } });
  if (!existing) throw new Error("Custom field definition not found.");
  if (!existing.active) {
    return { status: "SUCCESS", entityRef: { entityType: "CustomFieldDefinition", entityId: definitionId }, resultOutcome: "NO_CHANGE", metadata: { definitionId }, domainEvents: [], sideEffects: [] };
  }
  await deprecateCustomerCustomField({ organizationId, definitionId });
  return { status: "SUCCESS", entityRef: { entityType: "CustomFieldDefinition", entityId: definitionId }, resultSummary: "company.field_definition.deprecate completed.", metadata: { definitionId }, domainEvents: [], sideEffects: [] };
}
async function handleCompanyFieldValueWrite(envelope: ActionExecutionEnvelope) {
  const candidateId = String(envelope.input.candidateId); const input = values(envelope); const definitionId = String(input.definitionId ?? "");
  const definition = await prisma.customFieldDefinition.findFirst({ where: { id: definitionId, organizationId: envelope.executionContext.organizationId, module: "company", active: true } });
  if (!definition) throw new Error("CUSTOM_FIELD_NOT_FOUND");
  const existing = await prisma.companyDynamicFieldValue.findFirst({ where: { organizationId: envelope.executionContext.organizationId, definitionId, companyUnitId: typeof input.companyUnitId === "string" ? input.companyUnitId : null } });
  const row = existing
    ? await prisma.companyDynamicFieldValue.update({ where: { id: existing.id, organizationId: envelope.executionContext.organizationId }, data: { valueJson: input.value as Prisma.InputJsonValue, verificationStatus: "VERIFIED", provenanceJson: { businessCandidateId: candidateId } } })
    : await prisma.companyDynamicFieldValue.create({ data: { organizationId: envelope.executionContext.organizationId, definitionId, companyUnitId: typeof input.companyUnitId === "string" ? input.companyUnitId : null, valueJson: input.value as Prisma.InputJsonValue, verificationStatus: "VERIFIED", provenanceJson: { businessCandidateId: candidateId } } });
  return success(envelope, "CompanyDynamicFieldValue", row.id, candidateId);
}
async function handleCompanyGoalUpsert(envelope: ActionExecutionEnvelope) {
  const candidateId = String(envelope.input.candidateId); const input = values(envelope); const targetId = typeof envelope.input.targetRecordId === "string" ? envelope.input.targetRecordId : null;
  const data = { title: String(input.title ?? "Şirket hedefi"), period: String(input.period ?? "YEARLY") as "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM", scope: String(input.scope ?? "COMPANY"), goalType: String(input.goalType ?? "SALES"), currency: String(input.currency ?? "TRY"), targetValue: typeof input.targetValue === "number" || typeof input.targetValue === "string" ? new Prisma.Decimal(input.targetValue) : undefined, provenanceJson: { businessCandidateId: candidateId } };
  const row = targetId
    ? await prisma.salesGoal.update({ where: { id: targetId, organizationId: envelope.executionContext.organizationId }, data })
    : await prisma.salesGoal.create({ data: { organizationId: envelope.executionContext.organizationId, ...data } });
  return success(envelope, "SalesGoal", row.id, candidateId);
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
