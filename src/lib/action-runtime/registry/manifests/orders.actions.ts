import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "orders",
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["orders.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "order.cancel",
};

export const orderActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "order.create",
    inputSchema: {
      customerId: { type: "string", required: true },
      currency: { type: "string", required: false },
      notes: { type: "string", required: false },
      deadlineAt: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "order.transitionStatus",
    inputSchema: {
      orderId: { type: "string", required: true },
      toStatus: { type: "enum", required: true, enumValues: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PLANNED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "COMPLETED", "CANCELLED", "ON_HOLD"] },
      reason: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "order.cancel",
    inputSchema: {
      orderId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    compensationRef: null,
    isReversible: false,
  },
];
