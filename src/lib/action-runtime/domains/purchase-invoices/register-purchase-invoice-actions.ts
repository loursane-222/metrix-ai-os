import { handlePurchaseInvoiceCreate } from "./purchase-invoice-create-handler";
import { purchaseInvoiceConfirmHandler } from "./purchase-invoice-confirm-handler";
import { handlePurchaseInvoiceVoid } from "./purchase-invoice-void-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerPurchaseInvoiceActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("purchaseInvoice.createFromPurchaseOrder")) handlerRegistry.registerHandler("purchaseInvoice.createFromPurchaseOrder", handlePurchaseInvoiceCreate);
  if (!handlerRegistry.hasHandler("purchaseInvoice.confirm")) handlerRegistry.registerHandler("purchaseInvoice.confirm", purchaseInvoiceConfirmHandler);
  if (!handlerRegistry.hasHandler("purchaseInvoice.void")) handlerRegistry.registerHandler("purchaseInvoice.void", handlePurchaseInvoiceVoid);
}
