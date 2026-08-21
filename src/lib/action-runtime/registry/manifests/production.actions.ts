import type { ActionDefinition } from "../action-registry.types";
const base = { actionClass: "DOMAIN" as const, ownerModule: "production", inputSchema: {}, riskLevelBase: "LOW" as const, requiredPermissionSet: ["production.write"], approvalPolicy: "NONE" as const, approvalTtlClass: "STANDARD" as const, isReversible: true, compensationRef: "production.archive" };
export const productionActionDefinitions: ActionDefinition[] = [
  { ...base, actionName: "production.create" },
  { ...base, actionName: "production.update" },
  { ...base, actionName: "production.archive", compensationRef: null },
  { ...base, actionName: "workCenter.create", compensationRef: null },
  { ...base, actionName: "machine.create", compensationRef: null },
];
