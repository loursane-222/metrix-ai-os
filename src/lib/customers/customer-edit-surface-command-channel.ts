// Browser-local Surface Command Channel — the only bridge between METRIX
// chat (written + voice, mounted anywhere) and whichever CustomerEditScreen
// instance is currently mounted. Framework-free: a plain module-level
// registry, not React state, not a new global CustomerEditSurfaceRuntime —
// it never creates a runtime, it only holds a reference to the one the
// screen itself created and registered. Never exposes React setState or
// runtime internals; the only surface is register/unregister/descriptor/
// dispatch below.
//
// Single active slot by design: only one Customer Edit screen is ever
// visually mounted at a time in this app. A registration token still rides
// along every command so a resolution that started against one mounted
// screen can never land on a different (or no-longer-mounted) one — see
// dispatchCustomerEditSurfaceCommand's token check.

import type { CustomerEditCommand, CustomerEditCommandExecutionResult } from "./customer-edit-command-contract";
import { applyCustomerEditCommand } from "./customer-edit-command-apply";
import type { CustomerEditSurfaceRuntimeAdapter } from "./customer-edit-command-apply";
import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";

export type { CustomerEditSurfaceRuntimeAdapter } from "./customer-edit-command-apply";

export type CustomerEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CustomerEditCommand, CustomerEditCommandExecutionResult, CustomerEditSurfaceRuntimeAdapter>({
  domain: "customers", tokenPrefix: "cesc", applyCommand: applyCustomerEditCommand,
  staleResult: () => ({ status: "STALE_SURFACE" }),
  failureResult: (error) => ({ status: "EXECUTION_FAILED", error }),
});

/** Called once by the mounted screen's React bridge (useCustomerEditSurfaceRuntime). Returns a registration token to unregister with. */
export function registerCustomerEditSurfaceTarget(params: {
  entityId: string;
  runtime: CustomerEditSurfaceRuntimeAdapter;
}): string {
  return channel.register(params);
}

/** Only clears the active slot if it still belongs to this token — a stale unmount cleanup can never clobber a newer registration. */
export function unregisterCustomerEditSurfaceTarget(token: string): void {
  channel.unregister(token);
}

/**
 * Production-safe, unconditional invalidation for the canonical
 * conversation-change reset boundary (resetActiveConversationExtensionState).
 * A conversation switch has no registration token to present — it just needs
 * this channel's ownership gone before the next conversation's turns can
 * resolve against a screen instance that belonged to the previous one.
 */
export function invalidateCustomerEditSurfaceOwnership(): void {
  channel.invalidate();
}

/** Reads the active surface's identity/tab — used to decide whether a chat turn should even attempt command resolution. */
export function getActiveCustomerEditSurfaceDescriptor(): CustomerEditSurfaceDescriptor | null {
  return channel.getDescriptor();
}

/** Test-only escape hatch — production callers always go through register/unregister. */
export function resetCustomerEditSurfaceCommandChannelForTests(): void {
  channel.resetForTests();
}

export async function dispatchCustomerEditSurfaceCommand(
  token: string,
  command: CustomerEditCommand,
): Promise<CustomerEditCommandExecutionResult> {
  return channel.dispatch(token, command);
}
