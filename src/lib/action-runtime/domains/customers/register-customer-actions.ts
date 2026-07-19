import { customerUpdateHandler } from "./customer-update-handler";
import { customerCreateHandler } from "./customer-create-handler";
import { customerArchiveHandler } from "./customer-archive-handler";
import type { ActionHandlerRegistry } from "../../execution";
import { customFieldCreateHandler, customFieldDeprecateHandler, customFieldUpdateHandler } from "./custom-field-handlers";

/**
 * Composition-root kaydı. Registry (metadata) ile executable handler
 * binding'i kasıtlı olarak ayrı tutulur — bu fonksiyon yalnızca
 * ikincisini yapar ve Execution Runtime'ın kendisini domain-specific
 * importlarla kirletmez. Idempotent/duplicate-safe: zaten kayıtlıysa
 * tekrar kaydetmeye çalışmaz.
 */
export function registerCustomerActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("custom_field.create")) handlerRegistry.registerHandler("custom_field.create", customFieldCreateHandler);
  if (!handlerRegistry.hasHandler("custom_field.update_definition")) handlerRegistry.registerHandler("custom_field.update_definition", customFieldUpdateHandler);
  if (!handlerRegistry.hasHandler("custom_field.deprecate")) handlerRegistry.registerHandler("custom_field.deprecate", customFieldDeprecateHandler);
  if (!handlerRegistry.hasHandler("customer.create")) handlerRegistry.registerHandler("customer.create", customerCreateHandler);
  if (!handlerRegistry.hasHandler("customer.update")) {
    handlerRegistry.registerHandler("customer.update", customerUpdateHandler);
  }
  if (!handlerRegistry.hasHandler("customer.archive")) handlerRegistry.registerHandler("customer.archive", customerArchiveHandler);
}
