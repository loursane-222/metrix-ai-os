import type { ActionDefinition } from "../action-registry.types";

export const companyActionDefinitions: ActionDefinition[] = [{
  actionName: "company.profile.update",
  actionClass: "DOMAIN",
  ownerModule: "company",
  inputSchema: {
    candidateId: { type: "string", required: true },
    patch: { type: "json", required: true },
  },
  riskLevelBase: "MEDIUM",
  requiredPermissionSet: ["company.write"],
  approvalPolicy: "NONE",
  approvalTtlClass: "STANDARD",
  isReversible: true,
  compensationRef: null,
}, ...(["company.unit.create", "company.unit.update", "company.field_definition.create", "company.field_value.write", "company.goal.upsert"] as const).map((actionName): ActionDefinition => ({
  actionName,
  actionClass: "DOMAIN",
  ownerModule: "company",
  inputSchema: {
    candidateId: { type: "string", required: true },
    values: { type: "json", required: true },
    targetRecordId: { type: "string", required: false },
  },
  riskLevelBase: "MEDIUM",
  requiredPermissionSet: [actionName.startsWith("company.field_") ? "company.fields.manage" : actionName === "company.goal.upsert" ? "goals.write" : "company.write"],
  approvalPolicy: "NONE",
  approvalTtlClass: "STANDARD",
  isReversible: true,
  compensationRef: null,
}))];
