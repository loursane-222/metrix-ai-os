import { handleDeliveryCreate } from "./delivery-create-handler";
import { handleDeliveryCancel } from "./delivery-cancel-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerDeliveryActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("delivery.create")) handlerRegistry.registerHandler("delivery.create", handleDeliveryCreate);
  if (!handlerRegistry.hasHandler("delivery.cancel")) handlerRegistry.registerHandler("delivery.cancel", handleDeliveryCancel);
}
