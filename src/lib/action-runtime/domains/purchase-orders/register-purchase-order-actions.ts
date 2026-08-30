import { handlePurchaseOrderCreate } from "./purchase-order-create-handler";
import { handlePurchaseOrderTransitionStatus } from "./purchase-order-transition-status-handler";
import { handlePurchaseOrderCancel } from "./purchase-order-cancel-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerPurchaseOrderActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("purchaseOrder.create")) handlerRegistry.registerHandler("purchaseOrder.create", handlePurchaseOrderCreate);
  if (!handlerRegistry.hasHandler("purchaseOrder.transitionStatus")) handlerRegistry.registerHandler("purchaseOrder.transitionStatus", handlePurchaseOrderTransitionStatus);
  if (!handlerRegistry.hasHandler("purchaseOrder.cancel")) handlerRegistry.registerHandler("purchaseOrder.cancel", handlePurchaseOrderCancel);
}
