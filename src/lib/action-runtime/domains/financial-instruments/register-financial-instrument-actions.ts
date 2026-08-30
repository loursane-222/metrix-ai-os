import { handleFinancialInstrumentRegister } from "./financial-instrument-register-handler";
import { handleFinancialInstrumentApply } from "./financial-instrument-apply-handler";
import { financialInstrumentClearHandler } from "./financial-instrument-clear-handler";
import { handleFinancialInstrumentBounce } from "./financial-instrument-bounce-handler";
import { handleFinancialInstrumentCancel } from "./financial-instrument-cancel-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerFinancialInstrumentActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("financialInstrument.register")) handlerRegistry.registerHandler("financialInstrument.register", handleFinancialInstrumentRegister);
  if (!handlerRegistry.hasHandler("financialInstrument.applyToObligation")) handlerRegistry.registerHandler("financialInstrument.applyToObligation", handleFinancialInstrumentApply);
  if (!handlerRegistry.hasHandler("financialInstrument.clear")) handlerRegistry.registerHandler("financialInstrument.clear", financialInstrumentClearHandler);
  if (!handlerRegistry.hasHandler("financialInstrument.bounce")) handlerRegistry.registerHandler("financialInstrument.bounce", handleFinancialInstrumentBounce);
  if (!handlerRegistry.hasHandler("financialInstrument.cancel")) handlerRegistry.registerHandler("financialInstrument.cancel", handleFinancialInstrumentCancel);
}
