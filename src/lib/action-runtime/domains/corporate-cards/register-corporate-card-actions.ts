import {
  cardStatementCloseHandler,
  cardStatementOpenHandler,
  cardStatementPayHandler,
  cardStatementPaymentReverseHandler,
  corporateCardCreateHandler,
  corporateCardUpdateStatusHandler,
} from "./corporate-card-handlers";
import type { ActionHandlerRegistry } from "../../execution";

export function registerCorporateCardActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("corporateCard.create")) handlerRegistry.registerHandler("corporateCard.create", corporateCardCreateHandler);
  if (!handlerRegistry.hasHandler("corporateCard.updateStatus")) handlerRegistry.registerHandler("corporateCard.updateStatus", corporateCardUpdateStatusHandler);
  if (!handlerRegistry.hasHandler("cardStatement.open")) handlerRegistry.registerHandler("cardStatement.open", cardStatementOpenHandler);
  if (!handlerRegistry.hasHandler("cardStatement.close")) handlerRegistry.registerHandler("cardStatement.close", cardStatementCloseHandler);
  if (!handlerRegistry.hasHandler("cardStatement.pay")) handlerRegistry.registerHandler("cardStatement.pay", cardStatementPayHandler);
  if (!handlerRegistry.hasHandler("cardStatement.payment.reverse")) handlerRegistry.registerHandler("cardStatement.payment.reverse", cardStatementPaymentReverseHandler);
}
