import { DomainActionRejectedError } from "./draft.errors";
import type { ActionRegistryLike } from "./draft.types";
import type { ActionDefinition } from "../registry/action-registry.types";

/**
 * Draft/Surface Action Runtime yalnızca Registry'de actionClass=SURFACE
 * olarak tanımlı eylemleri işleyebilir. Bu, çekirdeğin kendi kendine
 * uyguladığı mimari sınır kontrolüdür — bir iş kuralı değildir.
 */
export function assertSurfaceAction(registry: ActionRegistryLike, actionName: string): ActionDefinition {
  const definition = registry.getActionDefinition(actionName);

  if (definition.actionClass !== "SURFACE") {
    throw new DomainActionRejectedError(actionName, definition.actionClass);
  }

  return definition;
}
