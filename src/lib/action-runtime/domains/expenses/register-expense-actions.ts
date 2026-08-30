import { expenseCreateHandler } from "./expense-create-handler";
import { expenseUpdateHandler } from "./expense-update-handler";
import { expenseCancelHandler } from "./expense-cancel-handler";
import { expenseSettleHandler } from "./expense-settle-handler";
import { expenseSettlementReverseHandler } from "./expense-settlement-reverse-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerExpenseActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("expense.create")) handlerRegistry.registerHandler("expense.create", expenseCreateHandler);
  if (!handlerRegistry.hasHandler("expense.update")) handlerRegistry.registerHandler("expense.update", expenseUpdateHandler);
  if (!handlerRegistry.hasHandler("expense.cancel")) handlerRegistry.registerHandler("expense.cancel", expenseCancelHandler);
  if (!handlerRegistry.hasHandler("expense.settle")) handlerRegistry.registerHandler("expense.settle", expenseSettleHandler);
  if (!handlerRegistry.hasHandler("expense.settlement.reverse")) handlerRegistry.registerHandler("expense.settlement.reverse", expenseSettlementReverseHandler);
}
