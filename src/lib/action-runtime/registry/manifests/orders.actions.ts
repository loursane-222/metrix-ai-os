import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "orders",
  inputSchema: {},
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["orders.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "order.cancel",
};

export const orderActionDefinitions: ActionDefinition[] = [
  { ...base, actionName: "order.create" },
  { ...base, actionName: "order.transitionStatus" },
  { ...base, actionName: "order.cancel", compensationRef: null, isReversible: false },
];
