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
      metrixNote: { type: "string", required: false },
      tier: { type: "string", required: false }, healthScore: { type: "number", required: false }, currency: { type: "string", required: false },
      cariKodu: { type: "string", required: false }, taxNumber: { type: "string", required: false }, taxOffice: { type: "string", required: false }, mersisNo: { type: "string", required: false }, tradeRegistryNo: { type: "string", required: false },
      billingAddress: { type: "json", required: false }, shippingAddress: { type: "json", required: false }, eInvoiceEnabled: { type: "boolean", required: false }, eArchiveEnabled: { type: "boolean", required: false }, primaryContact: { type: "json", required: false }, commercialTerms: { type: "json", required: false }, customFields: { type: "json", required: false },
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
      patch: { type: "json", required: true },
      expectedVersion: { type: "string", required: true },
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
