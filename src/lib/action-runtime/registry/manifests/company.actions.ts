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
}];
