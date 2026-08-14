import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import type { InvoiceEditCommand, InvoiceEditCommandExecutionResult } from "./invoice-edit-command-contract";

export type InvoiceEditSurfaceRuntimeAdapter = { getState(): { activeTab: "actions" }; applyCommand(command: InvoiceEditCommand): Promise<InvoiceEditCommandExecutionResult> };
export type InvoiceEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<InvoiceEditCommand, InvoiceEditCommandExecutionResult, InvoiceEditSurfaceRuntimeAdapter>({ domain: "invoices", tokenPrefix: "invesc", applyCommand: (command, runtime) => runtime.applyCommand(command), staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerInvoiceEditSurfaceTarget(params: { entityId: string; runtime: InvoiceEditSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterInvoiceEditSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateInvoiceEditSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveInvoiceEditSurfaceDescriptor(): InvoiceEditSurfaceDescriptor | null { return channel.getDescriptor(); }
export function resetInvoiceEditSurfaceCommandChannelForTests(): void { channel.resetForTests(); }
export function dispatchInvoiceEditSurfaceCommand(token: string, command: InvoiceEditCommand): Promise<InvoiceEditCommandExecutionResult> { return channel.dispatch(token, command); }
