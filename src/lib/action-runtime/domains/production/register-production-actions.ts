import { handleProductionCreate } from "./production-create-handler";
import { handleProductionUpdate } from "./production-update-handler";
import { handleProductionArchive } from "./production-archive-handler";
import { handleWorkCenterCreate } from "./work-center-create-handler";
import { workCenterArchiveHandler } from "./work-center-archive-handler";
import { handleMachineCreate } from "./machine-create-handler";
import { machineArchiveHandler } from "./machine-archive-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerProductionActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("production.create")) handlerRegistry.registerHandler("production.create", handleProductionCreate);
  if (!handlerRegistry.hasHandler("production.update")) handlerRegistry.registerHandler("production.update", handleProductionUpdate);
  if (!handlerRegistry.hasHandler("production.archive")) handlerRegistry.registerHandler("production.archive", handleProductionArchive);
  if (!handlerRegistry.hasHandler("workCenter.create")) handlerRegistry.registerHandler("workCenter.create", handleWorkCenterCreate);
  if (!handlerRegistry.hasHandler("workCenter.archive")) handlerRegistry.registerHandler("workCenter.archive", workCenterArchiveHandler);
  if (!handlerRegistry.hasHandler("machine.create")) handlerRegistry.registerHandler("machine.create", handleMachineCreate);
  if (!handlerRegistry.hasHandler("machine.archive")) handlerRegistry.registerHandler("machine.archive", machineArchiveHandler);
}
