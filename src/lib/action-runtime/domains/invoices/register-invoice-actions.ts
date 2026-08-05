import { invoiceCreateHandler } from "./invoice-create-handler";
import { invoiceSendHandler } from "./invoice-send-handler";
import type { ActionHandlerRegistry } from "../../execution";

/**
 * Composition-root registration for the Invoice capability, following the
 * same pattern as registerTaskActions/registerQuoteActions.
 */
export function registerInvoiceActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("invoice.create")) handlerRegistry.registerHandler("invoice.create", invoiceCreateHandler);
  if (!handlerRegistry.hasHandler("invoice.send")) handlerRegistry.registerHandler("invoice.send", invoiceSendHandler);
}
