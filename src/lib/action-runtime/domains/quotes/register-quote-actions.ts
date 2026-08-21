import { handleQuoteCreate } from "./quote-create-handler";
import { quoteUpdateHandler } from "./quote-update-handler";
import { quoteSendHandler } from "./quote-send-handler";
import { quoteDispatchHandler } from "./quote-dispatch-handler";
import type { ActionHandlerRegistry } from "../../execution";

/** Composition-root kaydı — bkz. register-customer-actions.ts aynı desen. */
export function registerQuoteActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("quote.create")) handlerRegistry.registerHandler("quote.create", handleQuoteCreate);
  if (!handlerRegistry.hasHandler("quote.update")) handlerRegistry.registerHandler("quote.update", quoteUpdateHandler);
  if (!handlerRegistry.hasHandler("quote.send")) handlerRegistry.registerHandler("quote.send", quoteSendHandler);
  if (!handlerRegistry.hasHandler("quote.dispatch")) handlerRegistry.registerHandler("quote.dispatch", quoteDispatchHandler);
}
