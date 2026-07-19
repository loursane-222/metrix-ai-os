import { HandlerAlreadyRegisteredError, HandlerNotFoundError } from "./execution.errors";
import type { ActionHandler, ActionHandlerRegistry } from "./execution.types";

/**
 * Registry ile karıştırılmamalıdır: Registry yalnızca metadata tutar,
 * bu ise gerçek çalıştırılabilir fonksiyonların çözüldüğü ayrı bir
 * kayıttır. Her createInMemoryHandlerRegistry() çağrısı izole bir Map
 * yaratır — global mutable state paylaşılmaz.
 */
export function createInMemoryHandlerRegistry(): ActionHandlerRegistry {
  const handlers = new Map<string, ActionHandler>();

  return {
    registerHandler(actionName, handler) {
      if (handlers.has(actionName)) {
        throw new HandlerAlreadyRegisteredError(actionName);
      }

      handlers.set(actionName, handler);
    },
    getHandler(actionName) {
      const handler = handlers.get(actionName);

      if (!handler) {
        throw new HandlerNotFoundError(actionName);
      }

      return handler;
    },
    hasHandler(actionName) {
      return handlers.has(actionName);
    },
    listHandlers() {
      return [...handlers.keys()].sort((left, right) => left.localeCompare(right));
    },
  };
}
