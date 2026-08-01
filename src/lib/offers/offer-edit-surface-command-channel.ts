// Browser-local Surface Command Channel for Offer Edit — mirrors
// customer-edit-surface-command-channel.ts exactly: the only bridge between
// METRIX chat (written + voice, mounted anywhere) and whichever
// OfferEditScreen instance is currently mounted. Single active slot by
// design: only one Offer Edit screen is ever visually mounted at a time.

import type { OfferEditCommand, OfferEditCommandExecutionResult } from "./offer-edit-command-contract";
import { applyOfferEditCommand } from "./offer-edit-command-apply";
import type { OfferEditSurfaceRuntimeAdapter } from "./offer-edit-command-apply";

export type { OfferEditSurfaceRuntimeAdapter } from "./offer-edit-command-apply";

export type OfferEditSurfaceDescriptor = {
  token: string;
  entityId: string;
  activeTab: string;
};

type RegisteredTarget = {
  token: string;
  entityId: string;
  runtime: OfferEditSurfaceRuntimeAdapter;
};

let activeTarget: RegisteredTarget | null = null;
let tokenCounter = 0;

export function registerOfferEditSurfaceTarget(params: { entityId: string; runtime: OfferEditSurfaceRuntimeAdapter }): string {
  tokenCounter += 1;
  const token = `oesc_${tokenCounter}`;
  activeTarget = { token, entityId: params.entityId, runtime: params.runtime };
  return token;
}

export function unregisterOfferEditSurfaceTarget(token: string): void {
  if (activeTarget?.token === token) {
    activeTarget = null;
  }
}

export function getActiveOfferEditSurfaceDescriptor(): OfferEditSurfaceDescriptor | null {
  if (!activeTarget) return null;
  return {
    token: activeTarget.token,
    entityId: activeTarget.entityId,
    activeTab: activeTarget.runtime.getState().activeTab,
  };
}

export function resetOfferEditSurfaceCommandChannelForTests(): void {
  activeTarget = null;
  tokenCounter = 0;
}

export async function dispatchOfferEditSurfaceCommand(
  token: string,
  command: OfferEditCommand,
): Promise<OfferEditCommandExecutionResult> {
  const target = activeTarget;
  if (!target || target.token !== token) {
    return { status: "STALE_SURFACE" };
  }

  try {
    return await applyOfferEditCommand(command, target.runtime);
  } catch (error) {
    return { status: "EXECUTION_FAILED", error: error instanceof Error ? error.message : "Bilinmeyen hata." };
  }
}
