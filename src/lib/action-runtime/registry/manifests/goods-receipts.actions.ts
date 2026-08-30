import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "goods-receipts",
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["goods_receipts.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "goodsReceipt.cancel",
};

export const goodsReceiptActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "goodsReceipt.createFromPurchaseOrder",
    inputSchema: {
      purchaseOrderId: { type: "string", required: true },
      warehouseId: { type: "string", required: true },
      notes: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "goodsReceipt.cancel",
    inputSchema: {
      goodsReceiptId: { type: "string", required: true },
      reason: { type: "string", required: true },
    },
    compensationRef: null,
    isReversible: false,
  },
];
