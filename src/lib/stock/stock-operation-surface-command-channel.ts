import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyStockOperationCommand, type StockOperationSurfaceRuntimeAdapter } from "./stock-operation-command-apply";
import type { StockOperationCommand, StockOperationCommandExecutionResult } from "./stock-operation-command-contract";
export type StockOperationSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<StockOperationCommand, StockOperationCommandExecutionResult, StockOperationSurfaceRuntimeAdapter>({ domain: "stocks", tokenPrefix: "stockosc", applyCommand: applyStockOperationCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerStockOperationSurfaceTarget(runtime: StockOperationSurfaceRuntimeAdapter): string { return channel.register({ entityId: "stock-operation", runtime }); }
export function unregisterStockOperationSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateStockOperationSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveStockOperationSurfaceDescriptor(): StockOperationSurfaceDescriptor | null { return channel.getDescriptor(); }
export function resetStockOperationSurfaceCommandChannelForTests(): void { channel.resetForTests(); }
export function dispatchStockOperationSurfaceCommand(token: string, command: StockOperationCommand): Promise<StockOperationCommandExecutionResult> { return channel.dispatch(token, command); }
