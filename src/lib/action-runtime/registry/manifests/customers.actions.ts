import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "customers";

export const customerActionDefinitions: ActionDefinition[] = [
  ...(["custom_field.create", "custom_field.update_definition", "custom_field.deprecate"] as const).map((actionName): ActionDefinition => ({
    actionName,
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: actionName === "custom_field.create" ? {
      module: { type: "enum", required: true, enumValues: ["customers", "company", "products", "suppliers", "employees"] }, entityType: { type: "string", required: true },
      key: { type: "string", required: true }, label: { type: "string", required: true }, description: { type: "string", required: false },
      valueType: { type: "string", required: true }, required: { type: "boolean", required: false }, options: { type: "json", required: false },
      defaultValue: { type: "json", required: false }, validation: { type: "json", required: false }, searchable: { type: "boolean", required: false },
      filterable: { type: "boolean", required: false }, reportable: { type: "boolean", required: false }, uiSection: { type: "string", required: false }, uiOrder: { type: "number", required: false },
      storageKind: { type: "string", required: false }, unit: { type: "string", required: false }, readable: { type: "boolean", required: false }, writable: { type: "boolean", required: false },
      normalization: { type: "json", required: false }, sourceOfTruth: { type: "string", required: false }, sensitivity: { type: "string", required: false }, riskLevel: { type: "string", required: false }, approvalPolicy: { type: "string", required: false },
    } : actionName === "custom_field.update_definition" ? {
      definitionId: { type: "string", required: true }, label: { type: "string", required: false }, description: { type: "string", required: false },
      required: { type: "boolean", required: false }, options: { type: "json", required: false }, defaultValue: { type: "json", required: false },
      validation: { type: "json", required: false }, searchable: { type: "boolean", required: false }, filterable: { type: "boolean", required: false },
      reportable: { type: "boolean", required: false }, uiSection: { type: "string", required: false }, uiOrder: { type: "number", required: false },
    } : { definitionId: { type: "string", required: true } },
    riskLevelBase: "HIGH", requiredPermissionSet: ["customers.fields.manage"], approvalPolicy: "EXPLICIT", approvalTtlClass: "SHORT",
    isReversible: actionName !== "custom_field.deprecate", compensationRef: null,
  })),
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
      billingAddress: { type: "json", required: false }, shippingAddress: { type: "json", required: false }, eInvoiceEnabled: { type: "boolean", required: false }, eArchiveEnabled: { type: "boolean", required: false }, primaryContact: { type: "json", required: false }, commercialTerms: { type: "json", required: false }, customFields: { type: "json", required: false }, additionalNotificationTargets: { type: "json", required: false },
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
    isReversible: true,
    // Self-compensating: replays its own action with a captured reverse
    // patch (see customer-update-handler.ts's compensationSnapshot).
    compensationRef: "customer.update",
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
  {
    // customer.archive's own compensationRef pointed here, but the action
    // never existed — reactivating an archived customer is low-risk (it
    // only restores visibility, unlike archiving which can hide a
    // legitimate customer), so unlike customer.archive this does not
    // require EXPLICIT approval.
    actionName: "customer.unarchive",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["customers.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
