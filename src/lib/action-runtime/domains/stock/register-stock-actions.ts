import { handleStockReceive } from "./stock-receive-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerStockActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("stock.receive")) handlerRegistry.registerHandler("stock.receive", handleStockReceive);
}
