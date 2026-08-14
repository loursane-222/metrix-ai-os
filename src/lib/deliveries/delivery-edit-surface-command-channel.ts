import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import type { DeliveryEditCommand, DeliveryEditCommandExecutionResult } from "./delivery-edit-command-contract";
export type DeliveryEditSurfaceRuntimeAdapter = { getState(): { activeTab: "actions" }; applyCommand(command: DeliveryEditCommand): Promise<DeliveryEditCommandExecutionResult> };
export type DeliveryEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<DeliveryEditCommand, DeliveryEditCommandExecutionResult, DeliveryEditSurfaceRuntimeAdapter>({ domain: "deliveries", tokenPrefix: "delesc", applyCommand: (command, runtime) => runtime.applyCommand(command), staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerDeliveryEditSurfaceTarget(params: { entityId: string; runtime: DeliveryEditSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterDeliveryEditSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateDeliveryEditSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveDeliveryEditSurfaceDescriptor(): DeliveryEditSurfaceDescriptor | null { return channel.getDescriptor(); }
export function resetDeliveryEditSurfaceCommandChannelForTests(): void { channel.resetForTests(); }
export function dispatchDeliveryEditSurfaceCommand(token: string, command: DeliveryEditCommand): Promise<DeliveryEditCommandExecutionResult> { return channel.dispatch(token, command); }
