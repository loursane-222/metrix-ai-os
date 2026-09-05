import { handleOrderCreate } from "./order-create-handler";
import { handleOrderTransitionStatus } from "./order-transition-status-handler";
import { handleOrderCancel } from "./order-cancel-handler";
import { handleOrderRevise } from "./order-revise-handler";
import { handleOrderAddException } from "./order-add-exception-handler";
import { handleOrderCreateFromQuote } from "./order-create-from-quote-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerOrderActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("order.create")) handlerRegistry.registerHandler("order.create", handleOrderCreate);
  if (!handlerRegistry.hasHandler("order.transitionStatus")) handlerRegistry.registerHandler("order.transitionStatus", handleOrderTransitionStatus);
  if (!handlerRegistry.hasHandler("order.cancel")) handlerRegistry.registerHandler("order.cancel", handleOrderCancel);
  if (!handlerRegistry.hasHandler("order.revise")) handlerRegistry.registerHandler("order.revise", handleOrderRevise);
  if (!handlerRegistry.hasHandler("order.addException")) handlerRegistry.registerHandler("order.addException", handleOrderAddException);
  if (!handlerRegistry.hasHandler("order.createFromQuote")) handlerRegistry.registerHandler("order.createFromQuote", handleOrderCreateFromQuote);
}
