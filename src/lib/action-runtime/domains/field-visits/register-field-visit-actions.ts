import { handleFieldVisitCreate } from "./field-visit-create-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerFieldVisitActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("field_visit.create")) handlerRegistry.registerHandler("field_visit.create", handleFieldVisitCreate);
}
