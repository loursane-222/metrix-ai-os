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
  { ...base, actionName: "order.transitionStatus", inputSchema: {} },
  { ...base, actionName: "order.cancel", inputSchema: {}, compensationRef: null, isReversible: false },
];
