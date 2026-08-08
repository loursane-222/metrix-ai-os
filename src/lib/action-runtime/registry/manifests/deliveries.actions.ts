import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "deliveries",
  inputSchema: {},
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["deliveries.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "delivery.cancel",
};

export const deliveryActionDefinitions: ActionDefinition[] = [
  { ...base, actionName: "delivery.create" },
  { ...base, actionName: "delivery.transitionStatus" },
  { ...base, actionName: "delivery.cancel", compensationRef: null, isReversible: false },
];
