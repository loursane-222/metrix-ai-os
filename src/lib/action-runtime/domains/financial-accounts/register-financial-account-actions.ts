import type { ActionHandlerRegistry } from "../../execution";
import { financialAccountCreateHandler, financialAccountDeactivateHandler, financialAccountUpdateHandler } from "./financial-account-handlers";

export function registerFinancialAccountActions(registry: ActionHandlerRegistry): void {
  if (!registry.hasHandler("financial_account.create")) registry.registerHandler("financial_account.create", financialAccountCreateHandler);
  if (!registry.hasHandler("financial_account.update")) registry.registerHandler("financial_account.update", financialAccountUpdateHandler);
  if (!registry.hasHandler("financial_account.deactivate")) registry.registerHandler("financial_account.deactivate", financialAccountDeactivateHandler);
}
