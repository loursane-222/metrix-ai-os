import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "purchase-invoices";

export const purchaseInvoiceActionDefinitions: ActionDefinition[] = [
  {
    actionName: "purchaseInvoice.createFromPurchaseOrder",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      purchaseOrderId: { type: "string", required: true },
      supplierInvoiceNumber: { type: "string", required: true },
      goodsReceiptId: { type: "string", required: false },
      dueDate: { type: "string", required: false },
      notes: { type: "string", required: false },
      idempotencyKey: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["purchase_invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "purchaseInvoice.void",
  },
  {
    actionName: "purchaseInvoice.confirm",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      purchaseInvoiceId: { type: "string", required: true },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["purchase_invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "purchaseInvoice.void",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      purchaseInvoiceId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["purchase_invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
