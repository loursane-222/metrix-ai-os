import { handleProductionCreate } from "./production-create-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerProductionActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("production.create")) handlerRegistry.registerHandler("production.create", handleProductionCreate);
}
