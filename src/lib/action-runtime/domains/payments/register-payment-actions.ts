import { paymentApplyHandler } from "./payment-apply-handler";
import { handlePaymentCreate } from "./payment-create-handler";
import type { ActionHandlerRegistry } from "../../execution";

/**
 * Composition-root registration for the Payment capability's mutation verbs,
 * following the same pattern as registerInvoiceActions/registerTaskActions.
 */
export function registerPaymentActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("payment.apply")) handlerRegistry.registerHandler("payment.apply", paymentApplyHandler);
  if (!handlerRegistry.hasHandler("payment.create")) handlerRegistry.registerHandler("payment.create", handlePaymentCreate);
}
