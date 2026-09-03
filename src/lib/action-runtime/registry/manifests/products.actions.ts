import type { ActionDefinition } from "../action-registry.types";

export const productActionDefinitions: ActionDefinition[] = [
  {
    actionName: "product.create",
    actionClass: "DOMAIN",
    ownerModule: "products",
    inputSchema: {
      candidateId: { type: "string", required: true },
      name: { type: "string", required: true },
      type: { type: "enum", required: true, enumValues: ["PRODUCT", "SERVICE"] },
      category: { type: "string", required: false },
      unit: { type: "string", required: false },
      currency: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["products.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "product.archive",
  },
  {
    actionName: "product.update",
    actionClass: "DOMAIN",
    ownerModule: "products",
    inputSchema: {
      productServiceId: { type: "string", required: true },
      name: { type: "string", required: false },
      category: { type: "string", required: false },
      unit: { type: "string", required: false },
      costCents: { type: "number", required: false },
      priceCents: { type: "number", required: false },
      currency: { type: "string", required: false },
      stockBehavior: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["products.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    // Self-compensating (bkz. customer.update aynı deseni).
    compensationRef: "product.update",
  },
  {
    actionName: "product.archive",
    actionClass: "DOMAIN",
    ownerModule: "products",
    inputSchema: {
      productServiceId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["products.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
