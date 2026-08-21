import { handleOrderCreate } from "./order-create-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerOrderActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("order.create")) handlerRegistry.registerHandler("order.create", handleOrderCreate);
}
