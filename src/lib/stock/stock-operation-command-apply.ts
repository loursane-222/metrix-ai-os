import type { ProductOption, SupplierOption, WarehouseRecord } from "./stocks-client";
import { STOCK_OPERATION_FIELDS, type ReceiptField, type StockOperationCommand, type StockOperationCommandExecutionResult, type StockOperationTab, type TransferField, type WarehouseField } from "./stock-operation-command-contract";
export type StockReceiptDraft = Record<ReceiptField, string>;
export type StockTransferDraft = Record<TransferField, string>;
export type StockWarehouseDraft = Record<WarehouseField, string>;
export type StockOperationSurfaceRuntimeAdapter = { getState(): { activeTab: StockOperationTab; tab: StockOperationTab; receipt: StockReceiptDraft; transfer: StockTransferDraft; warehouse: StockWarehouseDraft; products: ProductOption[]; warehouses: WarehouseRecord[]; suppliers: SupplierOption[] }; selectTab(tabId: StockOperationTab): void; setField(tabId: StockOperationTab, field: ReceiptField | TransferField | WarehouseField, value: string): void; submit(): Promise<{ ok: boolean; error?: string }>; discard(): void };
export async function applyStockOperationCommand(command: StockOperationCommand, runtime: StockOperationSurfaceRuntimeAdapter): Promise<StockOperationCommandExecutionResult> {
  switch (command.type) {
    case "select_tab": runtime.selectTab(command.tabId); return { status: "EXECUTED", command };
    case "set_field": runtime.setField(command.tabId, command.field, command.value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "submit": { const result = await runtime.submit(); return result.ok ? { status: "EXECUTED", command, submitOutcome: "SAVED" } : { status: "EXECUTION_FAILED", error: result.error ?? "Stok işlemi kaydedilemedi." }; }
    case "discard": { const activeTab = runtime.getState().activeTab; runtime.discard(); return { status: "EXECUTED", command, discardedFields: [...STOCK_OPERATION_FIELDS[activeTab]] }; }
  }
}
