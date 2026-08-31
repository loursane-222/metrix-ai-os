import { loanCreateHandler, loanDrawHandler, loanDrawdownReverseHandler, loanInstallmentRepayHandler, loanRepaymentReverseHandler } from "./loan-handlers";
import type { ActionHandlerRegistry } from "../../execution";

export function registerLoanActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("loan.create")) handlerRegistry.registerHandler("loan.create", loanCreateHandler);
  if (!handlerRegistry.hasHandler("loan.draw")) handlerRegistry.registerHandler("loan.draw", loanDrawHandler);
  if (!handlerRegistry.hasHandler("loan.drawdown.reverse")) handlerRegistry.registerHandler("loan.drawdown.reverse", loanDrawdownReverseHandler);
  if (!handlerRegistry.hasHandler("loan.installment.repay")) handlerRegistry.registerHandler("loan.installment.repay", loanInstallmentRepayHandler);
  if (!handlerRegistry.hasHandler("loan.repayment.reverse")) handlerRegistry.registerHandler("loan.repayment.reverse", loanRepaymentReverseHandler);
}
