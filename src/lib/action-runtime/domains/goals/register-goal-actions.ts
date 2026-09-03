import { goalCreateHandler } from "./goal-create-handler";
import { goalUpdateHandler } from "./goal-update-handler";
import { goalArchiveHandler } from "./goal-archive-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerGoalActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("goal.create")) handlerRegistry.registerHandler("goal.create", goalCreateHandler);
  if (!handlerRegistry.hasHandler("goal.update")) handlerRegistry.registerHandler("goal.update", goalUpdateHandler);
  if (!handlerRegistry.hasHandler("goal.archive")) handlerRegistry.registerHandler("goal.archive", goalArchiveHandler);
}
