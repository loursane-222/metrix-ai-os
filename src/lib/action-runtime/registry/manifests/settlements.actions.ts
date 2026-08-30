import type { ActionDefinition } from "../action-registry.types";

export const settlementActionDefinitions: ActionDefinition[] = [
  {
    actionName: "settlement.reverse",
    actionClass: "DOMAIN",
    ownerModule: "settlements",
    inputSchema: {
      settlementId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["payments.reverse"],
    approvalPolicy: "CONDITIONAL",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
