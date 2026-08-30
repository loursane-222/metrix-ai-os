import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "supplier-payments";

export const supplierPaymentActionDefinitions: ActionDefinition[] = [
  {
    actionName: "supplierPayment.apply",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      purchaseInvoiceId: { type: "string", required: true },
      amount: { type: "number", required: true },
      paymentMethod: { type: "string", required: true },
      financialAccountReference: { type: "string", required: true },
      occurredAt: { type: "string", required: false },
      idempotencyKey: { type: "string", required: false },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["supplier_payments.write"],
    approvalPolicy: "CONDITIONAL",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "supplierPayment.reverse",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      supplierPaymentId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["supplier_payments.reverse"],
    approvalPolicy: "CONDITIONAL",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
