import {
  employeeAdvanceCreateHandler,
  employeeAdvanceMoveHandler,
  employeeAdvanceMovementReverseHandler,
  employeeAdvanceReconcileHandler,
  employeeAdvanceReconciliationReverseHandler,
} from "./employee-advance-handlers";
import type { ActionHandlerRegistry } from "../../execution";

export function registerEmployeeAdvanceActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("employeeAdvance.create")) handlerRegistry.registerHandler("employeeAdvance.create", employeeAdvanceCreateHandler);
  if (!handlerRegistry.hasHandler("employeeAdvance.move")) handlerRegistry.registerHandler("employeeAdvance.move", employeeAdvanceMoveHandler);
  if (!handlerRegistry.hasHandler("employeeAdvance.movement.reverse")) handlerRegistry.registerHandler("employeeAdvance.movement.reverse", employeeAdvanceMovementReverseHandler);
  if (!handlerRegistry.hasHandler("employeeAdvance.reconcile")) handlerRegistry.registerHandler("employeeAdvance.reconcile", employeeAdvanceReconcileHandler);
  if (!handlerRegistry.hasHandler("employeeAdvance.reconciliation.reverse")) handlerRegistry.registerHandler("employeeAdvance.reconciliation.reverse", employeeAdvanceReconciliationReverseHandler);
}
