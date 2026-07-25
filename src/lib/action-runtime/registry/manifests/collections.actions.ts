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
  {
    actionName: "collection.set_lifecycle",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      collectionActionId: { type: "string", required: true },
      status: { type: "enum", required: true, enumValues: ["IN_PROGRESS", "DONE", "DISMISSED"] },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["collections.write"],
    approvalPolicy: "EXPLICIT",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
