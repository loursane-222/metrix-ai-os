import type { ActionDefinition } from "../action-registry.types";
const base = { actionClass: "DOMAIN" as const, ownerModule: "production", riskLevelBase: "LOW" as const, requiredPermissionSet: ["production.write"], approvalPolicy: "NONE" as const, approvalTtlClass: "STANDARD" as const, isReversible: true, compensationRef: "production.archive" };
export const productionActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "production.create",
    inputSchema: {
      orderNumber: { type: "string", required: true },
      productServiceId: { type: "string", required: false },
      quantityPlanned: { type: "number", required: true },
      plannedStartAt: { type: "string", required: false },
      plannedEndAt: { type: "string", required: false },
      notes: { type: "string", required: false },
    },
  },
  { ...base, actionName: "production.update", inputSchema: {} },
  { ...base, actionName: "production.archive", inputSchema: {}, compensationRef: null },
  { ...base, actionName: "workCenter.create", inputSchema: {}, compensationRef: null },
  { ...base, actionName: "machine.create", inputSchema: {}, compensationRef: null },
];
