import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "purchase-orders",
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["purchase_orders.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "purchaseOrder.cancel",
};

export const purchaseOrderActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "purchaseOrder.create",
    inputSchema: {
      supplierId: { type: "string", required: true },
      currency: { type: "string", required: false },
      notes: { type: "string", required: false },
      expectedDeliveryDate: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "purchaseOrder.transitionStatus",
    inputSchema: {
      purchaseOrderId: { type: "string", required: true },
      toStatus: { type: "enum", required: true, enumValues: ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] },
      reason: { type: "string", required: false },
    },
    // Was wrongly inheriting base.compensationRef ("purchaseOrder.cancel") —
    // cancelling the whole PO does not undo a mere status transition.
    compensationRef: "purchaseOrder.transitionStatus",
  },
  {
    ...base,
    actionName: "purchaseOrder.cancel",
    inputSchema: {
      purchaseOrderId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    compensationRef: null,
    isReversible: false,
  },
];
