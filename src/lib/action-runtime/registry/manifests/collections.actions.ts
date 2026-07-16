import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "collections";

export const collectionActionDefinitions: ActionDefinition[] = [
  {
    actionName: "collection.start",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      paymentId: { type: "string", required: true },
      customerId: { type: "string", required: false },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["collections.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
