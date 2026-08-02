import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "payments";

export const paymentActionDefinitions: ActionDefinition[] = [
  {
    actionName: "payment.apply",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      paymentId: { type: "string", required: true },
      amount: { type: "number", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["payments.write"],
    approvalPolicy: "CONDITIONAL",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
