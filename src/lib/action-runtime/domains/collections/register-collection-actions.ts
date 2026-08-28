import { collectionStartHandler } from "./collection-start-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerCollectionActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("collection.start")) handlerRegistry.registerHandler("collection.start", collectionStartHandler);
}
