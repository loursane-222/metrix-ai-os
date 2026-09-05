import { handleDeliveryCreate } from "./delivery-create-handler";
import { handleDeliveryCancel } from "./delivery-cancel-handler";
import { handleDeliveryTransitionStatus } from "./delivery-transition-status-handler";
import { handleDeliveryRecordProof } from "./delivery-record-proof-handler";
import { handleDeliveryAddException } from "./delivery-add-exception-handler";
import { handleDeliveryCreateFromOrder } from "./delivery-create-from-order-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerDeliveryActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("delivery.create")) handlerRegistry.registerHandler("delivery.create", handleDeliveryCreate);
  if (!handlerRegistry.hasHandler("delivery.cancel")) handlerRegistry.registerHandler("delivery.cancel", handleDeliveryCancel);
  if (!handlerRegistry.hasHandler("delivery.transitionStatus")) handlerRegistry.registerHandler("delivery.transitionStatus", handleDeliveryTransitionStatus);
  if (!handlerRegistry.hasHandler("delivery.recordProof")) handlerRegistry.registerHandler("delivery.recordProof", handleDeliveryRecordProof);
  if (!handlerRegistry.hasHandler("delivery.addException")) handlerRegistry.registerHandler("delivery.addException", handleDeliveryAddException);
  if (!handlerRegistry.hasHandler("delivery.createFromOrder")) handlerRegistry.registerHandler("delivery.createFromOrder", handleDeliveryCreateFromOrder);
}
