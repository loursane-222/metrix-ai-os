import { customerUpdateHandler } from "./customer-update-handler";
import type { ActionHandlerRegistry } from "../../execution";

/**
 * Composition-root kaydı. Registry (metadata) ile executable handler
 * binding'i kasıtlı olarak ayrı tutulur — bu fonksiyon yalnızca
 * ikincisini yapar ve Execution Runtime'ın kendisini domain-specific
 * importlarla kirletmez. Idempotent/duplicate-safe: zaten kayıtlıysa
 * tekrar kaydetmeye çalışmaz.
 */
export function registerCustomerActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("customer.update")) {
    handlerRegistry.registerHandler("customer.update", customerUpdateHandler);
  }
}
