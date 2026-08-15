import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyCompanyProfileEditCommand, type CompanyProfileEditSurfaceRuntimeAdapter } from "./company-profile-edit-command-apply";
import type { CompanyProfileEditCommand, CompanyProfileEditCommandExecutionResult } from "./company-profile-edit-command-contract";
export type CompanyProfileEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CompanyProfileEditCommand, CompanyProfileEditCommandExecutionResult, CompanyProfileEditSurfaceRuntimeAdapter>({ domain: "company", tokenPrefix: "cpedit", applyCommand: applyCompanyProfileEditCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerCompanyProfileEditSurfaceTarget(params: { entityId: string; runtime: CompanyProfileEditSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterCompanyProfileEditSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateCompanyProfileEditSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveCompanyProfileEditSurfaceDescriptor(): CompanyProfileEditSurfaceDescriptor | null { return channel.getDescriptor(); }
export function dispatchCompanyProfileEditSurfaceCommand(token: string, command: CompanyProfileEditCommand): Promise<CompanyProfileEditCommandExecutionResult> { return channel.dispatch(token, command); }
