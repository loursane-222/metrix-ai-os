import { obligationMaterializeReceivableHandler } from "./obligation-materialize-receivable-handler";
import { obligationMaterializePayableHandler } from "./obligation-materialize-payable-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerObligationActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("obligation.materializeReceivable")) handlerRegistry.registerHandler("obligation.materializeReceivable", obligationMaterializeReceivableHandler);
  if (!handlerRegistry.hasHandler("obligation.materializePayable")) handlerRegistry.registerHandler("obligation.materializePayable", obligationMaterializePayableHandler);
}
