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
      reason: { type: "string", required: false },
      supplierId: { type: "string", required: false },
      expectedAt: { type: "string", required: false },
      unitCostCents: { type: "number", required: false },
      qualityFlag: { type: "string", required: false },
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
    // Residual Capability Parity Migration: wraps recordPhysicalCount, the
    // same canonical service stock-management-conversation-extension.ts's
    // COUNT_AT_WAREHOUSE/COUNT_PRODUCT branches already called via POST
    // /api/stock/counts. A distinct two-step workflow from stock.adjustment
    // (immediate) — this creates a PENDING variance record that
    // stock.resolveVariance must separately confirm/dismiss.
    actionName: "stock.recordCount",
    inputSchema: {
      stockId: { type: "string", required: true },
      countedQuantity: { type: "number", required: true },
      note: { type: "string", required: false },
    },
    compensationRef: null,
    isReversible: false,
  },
  {
    ...base,
    // Wraps resolveInventoryVariance, the same canonical service the
    // extension's CONFIRM_VARIANCE/DISMISS_VARIANCE branches already called
    // via POST /api/stock/counts/[countRecordId]/resolve.
    actionName: "stock.resolveVariance",
    inputSchema: {
      countRecordId: { type: "string", required: true },
      resolution: { type: "enum", required: true, enumValues: ["CONFIRM", "DISMISS"] },
      note: { type: "string", required: false },
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
