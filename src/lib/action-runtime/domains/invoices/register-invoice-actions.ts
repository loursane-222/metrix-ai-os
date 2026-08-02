import { invoiceCreateHandler } from "./invoice-create-handler";
import type { ActionHandlerRegistry } from "../../execution";

/**
 * Composition-root registration for the Invoice capability, following the
 * same pattern as registerTaskActions/registerQuoteActions.
 */
export function registerInvoiceActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("invoice.create")) handlerRegistry.registerHandler("invoice.create", invoiceCreateHandler);
}
