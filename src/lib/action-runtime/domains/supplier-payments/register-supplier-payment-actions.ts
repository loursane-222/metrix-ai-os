import { supplierPaymentApplyHandler } from "./supplier-payment-apply-handler";
import { supplierPaymentReverseHandler } from "./supplier-payment-reverse-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerSupplierPaymentActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("supplierPayment.apply")) handlerRegistry.registerHandler("supplierPayment.apply", supplierPaymentApplyHandler);
  if (!handlerRegistry.hasHandler("supplierPayment.reverse")) handlerRegistry.registerHandler("supplierPayment.reverse", supplierPaymentReverseHandler);
}
