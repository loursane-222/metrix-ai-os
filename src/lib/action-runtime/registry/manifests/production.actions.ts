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
  {
    ...base,
    actionName: "production.update",
    inputSchema: {
      productionOrderId: { type: "string", required: true },
      status: { type: "enum", required: false, enumValues: ["DRAFT", "PLANNED", "RELEASED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] },
      quantityPlanned: { type: "number", required: false },
      quantityProduced: { type: "number", required: false },
      plannedStartAt: { type: "string", required: false },
      plannedEndAt: { type: "string", required: false },
      actualStartAt: { type: "string", required: false },
      actualEndAt: { type: "string", required: false },
      workCenterId: { type: "string", required: false },
      notes: { type: "string", required: false },
      statusChangeReason: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "production.archive",
    inputSchema: { productionOrderId: { type: "string", required: true } },
    compensationRef: null,
  },
  {
    ...base,
    actionName: "workCenter.create",
    inputSchema: {
      name: { type: "string", required: true },
      code: { type: "string", required: true },
      notes: { type: "string", required: false },
    },
    compensationRef: null,
  },
  {
    ...base,
    actionName: "machine.create",
    inputSchema: {
      workCenterId: { type: "string", required: true },
      name: { type: "string", required: true },
      code: { type: "string", required: true },
      notes: { type: "string", required: false },
    },
    compensationRef: null,
  },
];
