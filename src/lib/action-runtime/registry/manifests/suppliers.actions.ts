import type { ActionDefinition } from "../action-registry.types";
const base = { actionClass: "DOMAIN" as const, ownerModule: "suppliers", inputSchema: {}, riskLevelBase: "LOW" as const, requiredPermissionSet: ["suppliers.write"], approvalPolicy: "NONE" as const, approvalTtlClass: "STANDARD" as const, isReversible: true, compensationRef: "supplier.archive" };
export const supplierActionDefinitions: ActionDefinition[] = [
  { ...base, actionName: "supplier.create" },
  { ...base, actionName: "supplier.update" },
  { ...base, actionName: "supplier.archive", compensationRef: null },
];
