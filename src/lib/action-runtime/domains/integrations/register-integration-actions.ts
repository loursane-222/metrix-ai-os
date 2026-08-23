import { handlePushInvoiceToBizimHesap } from "./push-invoice-to-bizimhesap-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerIntegrationActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("integration.bizimhesap.push_invoice")) handlerRegistry.registerHandler("integration.bizimhesap.push_invoice", handlePushInvoiceToBizimHesap);
}
