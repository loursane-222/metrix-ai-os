import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "quotes";

export const quoteActionDefinitions: ActionDefinition[] = [
  {
    actionName: "quote.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
      title: { type: "string", required: true },
      amount: { type: "number", required: true },
      currency: { type: "string", required: false },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "quote.set_lifecycle",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      quoteId: { type: "string", required: true },
      status: { type: "enum", required: true, enumValues: ["WON", "LOST", "CANCELLED"] },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "EXPLICIT",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
