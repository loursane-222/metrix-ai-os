// Browser-local Surface Command Channel for Offer Edit — mirrors
// customer-edit-surface-command-channel.ts exactly: the only bridge between
// METRIX chat (written + voice, mounted anywhere) and whichever
// OfferEditScreen instance is currently mounted. Single active slot by
// design: only one Offer Edit screen is ever visually mounted at a time.

import type { OfferEditCommand, OfferEditCommandExecutionResult } from "./offer-edit-command-contract";
import { applyOfferEditCommand } from "./offer-edit-command-apply";
import type { OfferEditSurfaceRuntimeAdapter } from "./offer-edit-command-apply";
import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";

export type { OfferEditSurfaceRuntimeAdapter } from "./offer-edit-command-apply";

export type OfferEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<OfferEditCommand, OfferEditCommandExecutionResult, OfferEditSurfaceRuntimeAdapter>({
  domain: "offers", tokenPrefix: "oesc", applyCommand: applyOfferEditCommand,
  staleResult: () => ({ status: "STALE_SURFACE" }),
  failureResult: (error) => ({ status: "EXECUTION_FAILED", error }),
});

export function registerOfferEditSurfaceTarget(params: { entityId: string; runtime: OfferEditSurfaceRuntimeAdapter }): string {
  return channel.register(params);
}

export function unregisterOfferEditSurfaceTarget(token: string): void {
  channel.unregister(token);
}

/** Production-safe, unconditional invalidation for the canonical conversation-change reset boundary — mirrors invalidateCustomerEditSurfaceOwnership exactly. */
export function invalidateOfferEditSurfaceOwnership(): void {
  channel.invalidate();
}

export function getActiveOfferEditSurfaceDescriptor(): OfferEditSurfaceDescriptor | null {
  return channel.getDescriptor();
}

export function resetOfferEditSurfaceCommandChannelForTests(): void {
  channel.resetForTests();
}

export async function dispatchOfferEditSurfaceCommand(
  token: string,
  command: OfferEditCommand,
): Promise<OfferEditCommandExecutionResult> {
  return channel.dispatch(token, command);
}
