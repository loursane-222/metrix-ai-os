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
    // Self-compensating: replays stock.adjustment with the pre-adjustment
    // counted quantity (see stock-adjustment-handler.ts). Also the shared
    // compensator target for stock.receive/stock.transfer (see
    // compensation.ts's COMPENSATION_INPUT_BUILDERS).
    isReversible: true,
    compensationRef: "stock.adjustment",
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
    // Was wrongly inheriting base.compensationRef ("stock.adjustment") —
    // adjusting a stock quantity does not undo creating a warehouse.
    compensationRef: "warehouse.archive",
  },
  {
    ...base,
    actionName: "warehouse.archive",
    inputSchema: { warehouseId: { type: "string", required: true } },
    compensationRef: null,
    isReversible: false,
  },
];
