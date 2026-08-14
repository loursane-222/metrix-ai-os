import { isRecord } from "@/lib/api/validation";

export const STOCK_OPERATION_TABS = ["receipt", "transfer", "warehouses"] as const;
export type StockOperationTab = (typeof STOCK_OPERATION_TABS)[number];
export const STOCK_OPERATION_FIELDS = {
  receipt: ["productServiceId", "warehouseId", "quantity", "lot", "batch", "serialNumber", "location", "reason", "supplierId", "expectedAt", "unitCost", "qualityFlag"],
  transfer: ["productServiceId", "fromWarehouseId", "toWarehouseId", "quantity", "lot", "batch", "serialNumber", "reason"],
  warehouses: ["name", "code", "type", "address", "notes"],
} as const;
export type ReceiptField = (typeof STOCK_OPERATION_FIELDS.receipt)[number];
export type TransferField = (typeof STOCK_OPERATION_FIELDS.transfer)[number];
export type WarehouseField = (typeof STOCK_OPERATION_FIELDS.warehouses)[number];
export type StockOperationField = ReceiptField | TransferField | WarehouseField;
export type StockOperationCommand =
  | { type: "select_tab"; tabId: StockOperationTab }
  | { type: "set_field"; tabId: "receipt"; field: ReceiptField; value: string }
  | { type: "set_field"; tabId: "transfer"; field: TransferField; value: string }
  | { type: "set_field"; tabId: "warehouses"; field: WarehouseField; value: string }
  | { type: "submit" }
  | { type: "discard" };
export type StockOperationCommandResolution = { kind: "executable"; command: StockOperationCommand } | { kind: "unsupported" } | { kind: "clarification_required"; message: string };
export type StockOperationCommandExecutionResult = { status: "EXECUTED"; command: StockOperationCommand; appliedField?: string; appliedValue?: string; submitOutcome?: "SAVED"; discardedFields?: string[] } | { status: "UNSUPPORTED" } | { status: "CLARIFICATION_REQUIRED"; message: string } | { status: "NO_ACTIVE_SURFACE" } | { status: "STALE_SURFACE" } | { status: "VALIDATION_FAILED"; reason: string } | { status: "EXECUTION_FAILED"; error: string };

function tab(value: unknown): value is StockOperationTab { return typeof value === "string" && (STOCK_OPERATION_TABS as readonly string[]).includes(value); }
function fieldForTab(tabId: StockOperationTab, value: unknown): value is StockOperationField { return typeof value === "string" && (STOCK_OPERATION_FIELDS[tabId] as readonly string[]).includes(value); }

export function validateStockOperationCommandResolution(raw: unknown): StockOperationCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.result === "unsupported") return { kind: "unsupported" };
  if (raw.result === "clarification_required") return typeof raw.message === "string" && raw.message.trim() ? { kind: "clarification_required", message: raw.message.trim() } : null;
  if (raw.result !== "executable") return null;
  if (raw.action === "submit" || raw.action === "discard") return { kind: "executable", command: { type: raw.action } };
  if (raw.action === "select_tab" && tab(raw.tabId)) return { kind: "executable", command: { type: "select_tab", tabId: raw.tabId } };
  if (raw.action === "set_field" && tab(raw.tabId) && fieldForTab(raw.tabId, raw.field) && typeof raw.value === "string") {
    return { kind: "executable", command: { type: "set_field", tabId: raw.tabId, field: raw.field, value: raw.value } as StockOperationCommand };
  }
  return null;
}

export function revalidateStockOperationCommandResolution(raw: unknown): StockOperationCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "unsupported") return { kind: "unsupported" };
  if (raw.kind === "clarification_required") return typeof raw.message === "string" && raw.message.trim() ? { kind: "clarification_required", message: raw.message.trim() } : null;
  if (raw.kind !== "executable" || !isRecord(raw.command)) return null;
  return validateStockOperationCommandResolution({ result: "executable", action: raw.command.type, ...raw.command });
}
