import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "payments";

export const paymentActionDefinitions: ActionDefinition[] = [
  {
    actionName: "payment.apply",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
      quoteId: { type: "string", required: false },
      amount: { type: "number", required: true },
      currency: { type: "string", required: false },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["payments.write"],
    approvalPolicy: "CONDITIONAL",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
