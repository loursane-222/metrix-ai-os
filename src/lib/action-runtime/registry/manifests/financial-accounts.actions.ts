import type { ActionDefinition } from "../action-registry.types";

const mutableMetadata = {
  bankName: { type: "string" as const, required: false },
  branchName: { type: "string" as const, required: false },
  iban: { type: "string" as const, required: false },
  accountNumber: { type: "string" as const, required: false },
};

export const financialAccountActionDefinitions: ActionDefinition[] = [
  {
    actionName: "financial_account.create", actionClass: "DOMAIN", ownerModule: "financial_accounts", riskLevelBase: "LOW",
    requiredPermissionSet: ["financial_accounts.create"], approvalPolicy: "NONE", approvalTtlClass: "STANDARD", isReversible: true, compensationRef: "financial_account.deactivate",
    inputSchema: { type: { type: "string", required: true }, name: { type: "string", required: true }, currency: { type: "string", required: true }, ...mutableMetadata },
  },
  {
    actionName: "financial_account.update", actionClass: "DOMAIN", ownerModule: "financial_accounts", riskLevelBase: "LOW",
    requiredPermissionSet: ["financial_accounts.update"], approvalPolicy: "NONE", approvalTtlClass: "STANDARD", isReversible: false, compensationRef: null,
    inputSchema: { financialAccountId: { type: "string", required: true }, name: { type: "string", required: false }, ...mutableMetadata },
  },
  {
    actionName: "financial_account.deactivate", actionClass: "DOMAIN", ownerModule: "financial_accounts", riskLevelBase: "LOW",
    requiredPermissionSet: ["financial_accounts.deactivate"], approvalPolicy: "NONE", approvalTtlClass: "STANDARD", isReversible: false, compensationRef: null,
    inputSchema: { financialAccountId: { type: "string", required: true } },
  },
];
