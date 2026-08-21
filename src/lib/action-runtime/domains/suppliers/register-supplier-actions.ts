import { handleSupplierCreate } from "./supplier-create-handler";
import { handleSupplierUpdate } from "./supplier-update-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerSupplierActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("supplier.create")) handlerRegistry.registerHandler("supplier.create", handleSupplierCreate);
  if (!handlerRegistry.hasHandler("supplier.update")) handlerRegistry.registerHandler("supplier.update", handleSupplierUpdate);
}
