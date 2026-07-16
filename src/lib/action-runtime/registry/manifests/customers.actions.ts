import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "customers";

export const customerActionDefinitions: ActionDefinition[] = [
  {
    actionName: "customer.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      displayName: { type: "string", required: true },
      legalName: { type: "string", required: false },
      phone: { type: "string", required: false },
      email: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["customers.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "customer.archive",
  },
  {
    actionName: "customer.update",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
      displayName: { type: "string", required: false },
      phone: { type: "string", required: false },
      email: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["customers.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "customer.archive",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["customers.write", "customers.archive"],
    approvalPolicy: "EXPLICIT",
    approvalTtlClass: "SHORT",
    isReversible: true,
    compensationRef: "customer.unarchive",
  },
];
