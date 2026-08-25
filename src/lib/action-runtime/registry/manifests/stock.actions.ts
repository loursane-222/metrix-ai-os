import type { ActionDefinition } from "../action-registry.types";

const base = {
  actionClass: "DOMAIN" as const,
  ownerModule: "stock",
  riskLevelBase: "LOW" as const,
  requiredPermissionSet: ["stock.write"],
  approvalPolicy: "NONE" as const,
  approvalTtlClass: "STANDARD" as const,
  isReversible: true,
  compensationRef: "stock.adjustment",
};

export const stockActionDefinitions: ActionDefinition[] = [
  {
    ...base,
    actionName: "stock.receive",
    inputSchema: {
      productServiceId: { type: "string", required: true },
      warehouseId: { type: "string", required: true },
      quantity: { type: "number", required: true },
      lot: { type: "string", required: false },
      batch: { type: "string", required: false },
      serialNumber: { type: "string", required: false },
      location: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "stock.transfer",
    inputSchema: {
      productServiceId: { type: "string", required: true },
      fromWarehouseId: { type: "string", required: true },
      toWarehouseId: { type: "string", required: true },
      quantity: { type: "number", required: true },
      lot: { type: "string", required: false },
      batch: { type: "string", required: false },
      serialNumber: { type: "string", required: false },
      reason: { type: "string", required: false },
    },
  },
  {
    ...base,
    actionName: "stock.adjustment",
    inputSchema: {
      productServiceId: { type: "string", required: true },
      warehouseId: { type: "string", required: true },
      countedQuantity: { type: "number", required: true },
      lot: { type: "string", required: false },
      batch: { type: "string", required: false },
      serialNumber: { type: "string", required: false },
      reason: { type: "string", required: false },
    },
    compensationRef: null,
    isReversible: false,
  },
  {
    ...base,
    actionName: "warehouse.create",
    inputSchema: {
      name: { type: "string", required: true },
      code: { type: "string", required: true },
      type: { type: "string", required: false },
      address: { type: "string", required: false },
      notes: { type: "string", required: false },
    },
  },
];
