import { settlementReverseHandler } from "./settlement-reverse-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerSettlementActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("settlement.reverse")) handlerRegistry.registerHandler("settlement.reverse", settlementReverseHandler);
}
