import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import type { OrderEditCommand, OrderEditCommandExecutionResult } from "./order-edit-command-contract";

export type OrderEditSurfaceRuntimeAdapter = { getState(): { activeTab: "actions" }; applyCommand(command: OrderEditCommand): Promise<OrderEditCommandExecutionResult> };
export type OrderEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<OrderEditCommand, OrderEditCommandExecutionResult, OrderEditSurfaceRuntimeAdapter>({ domain: "orders", tokenPrefix: "ordesc", applyCommand: (command, runtime) => runtime.applyCommand(command), staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerOrderEditSurfaceTarget(params: { entityId: string; runtime: OrderEditSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterOrderEditSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateOrderEditSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveOrderEditSurfaceDescriptor(): OrderEditSurfaceDescriptor | null { return channel.getDescriptor(); }
export function resetOrderEditSurfaceCommandChannelForTests(): void { channel.resetForTests(); }
export function dispatchOrderEditSurfaceCommand(token: string, command: OrderEditCommand): Promise<OrderEditCommandExecutionResult> { return channel.dispatch(token, command); }
