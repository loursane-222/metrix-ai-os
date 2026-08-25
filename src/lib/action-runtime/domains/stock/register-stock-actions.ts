import { handleStockReceive } from "./stock-receive-handler";
import { handleStockTransfer } from "./stock-transfer-handler";
import { handleStockAdjustment } from "./stock-adjustment-handler";
import { handleWarehouseCreate } from "./warehouse-create-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerStockActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("stock.receive")) handlerRegistry.registerHandler("stock.receive", handleStockReceive);
  if (!handlerRegistry.hasHandler("stock.transfer")) handlerRegistry.registerHandler("stock.transfer", handleStockTransfer);
  if (!handlerRegistry.hasHandler("stock.adjustment")) handlerRegistry.registerHandler("stock.adjustment", handleStockAdjustment);
  if (!handlerRegistry.hasHandler("warehouse.create")) handlerRegistry.registerHandler("warehouse.create", handleWarehouseCreate);
}
