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

export type { CustomerEditSurfaceRuntimeAdapter } from "./customer-edit-command-apply";

export type CustomerEditSurfaceDescriptor = {
  token: string;
  entityId: string;
  activeTab: string;
};

type RegisteredTarget = {
  token: string;
  entityId: string;
  runtime: CustomerEditSurfaceRuntimeAdapter;
};

let activeTarget: RegisteredTarget | null = null;
let tokenCounter = 0;

/** Called once by the mounted screen's React bridge (useCustomerEditSurfaceRuntime). Returns a registration token to unregister with. */
export function registerCustomerEditSurfaceTarget(params: {
  entityId: string;
  runtime: CustomerEditSurfaceRuntimeAdapter;
}): string {
  tokenCounter += 1;
  const token = `cesc_${tokenCounter}`;
  activeTarget = { token, entityId: params.entityId, runtime: params.runtime };
  return token;
}

/** Only clears the active slot if it still belongs to this token — a stale unmount cleanup can never clobber a newer registration. */
export function unregisterCustomerEditSurfaceTarget(token: string): void {
  if (activeTarget?.token === token) {
    activeTarget = null;
  }
}

/** Reads the active surface's identity/tab — used to decide whether a chat turn should even attempt command resolution. */
export function getActiveCustomerEditSurfaceDescriptor(): CustomerEditSurfaceDescriptor | null {
  if (!activeTarget) return null;
  return {
    token: activeTarget.token,
    entityId: activeTarget.entityId,
    activeTab: activeTarget.runtime.getState().activeTab,
  };
}

/** Test-only escape hatch — production callers always go through register/unregister. */
export function resetCustomerEditSurfaceCommandChannelForTests(): void {
  activeTarget = null;
  tokenCounter = 0;
}

export async function dispatchCustomerEditSurfaceCommand(
  token: string,
  command: CustomerEditCommand,
): Promise<CustomerEditCommandExecutionResult> {
  const target = activeTarget;
  if (!target || target.token !== token) {
    return { status: "STALE_SURFACE" };
  }

  try {
    return await applyCustomerEditCommand(command, target.runtime);
  } catch (error) {
    return { status: "EXECUTION_FAILED", error: error instanceof Error ? error.message : "Bilinmeyen hata." };
  }
}
