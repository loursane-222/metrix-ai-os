import { handleDeliveryCreate } from "./delivery-create-handler";
import { handleDeliveryCancel } from "./delivery-cancel-handler";
import { handleDeliveryTransitionStatus } from "./delivery-transition-status-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerDeliveryActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("delivery.create")) handlerRegistry.registerHandler("delivery.create", handleDeliveryCreate);
  if (!handlerRegistry.hasHandler("delivery.cancel")) handlerRegistry.registerHandler("delivery.cancel", handleDeliveryCancel);
  if (!handlerRegistry.hasHandler("delivery.transitionStatus")) handlerRegistry.registerHandler("delivery.transitionStatus", handleDeliveryTransitionStatus);
}
