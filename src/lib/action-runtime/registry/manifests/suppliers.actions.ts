import type { ActionDefinition } from "../action-registry.types";
const base = { actionClass: "DOMAIN" as const, ownerModule: "suppliers", riskLevelBase: "LOW" as const, requiredPermissionSet: ["suppliers.write"], approvalPolicy: "NONE" as const, approvalTtlClass: "STANDARD" as const, isReversible: true, compensationRef: "supplier.archive" };
export const supplierActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "supplier.create",
    inputSchema: {
      displayName: { type: "string", required: true },
      legalName: { type: "string", required: false },
      phone: { type: "string", required: false },
      email: { type: "string", required: false },
      website: { type: "string", required: false },
      taxNumber: { type: "string", required: false },
      taxOffice: { type: "string", required: false },
      currency: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "supplier.update",
    inputSchema: {
      id: { type: "string", required: true },
      patch: { type: "json", required: true },
    },
  },
  { ...base, actionName: "supplier.archive", inputSchema: {}, compensationRef: null },
];
