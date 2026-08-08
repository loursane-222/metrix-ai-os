import { taskCreateHandler } from "./task-create-handler";
import { taskCompleteHandler } from "./task-complete-handler";
import type { ActionHandlerRegistry } from "../../execution";

/**
 * Composition-root registration for the Task capability, following the same
 * pattern as registerCustomerActions/registerProductActions/registerCompanyActions.
 */
export function registerTaskActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("task.create")) handlerRegistry.registerHandler("task.create", taskCreateHandler);
  if (!handlerRegistry.hasHandler("task.complete")) handlerRegistry.registerHandler("task.complete", taskCompleteHandler);
}
